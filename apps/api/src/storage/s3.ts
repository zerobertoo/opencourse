import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/** What the API and the worker need from the object storage. Speaks generic S3. */
export interface Storage {
  startMultipartUpload(key: string, contentType: string): Promise<string>;
  /** Address the browser PUTs one part to; it only accepts a body of exactly `sizeBytes`. */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<string>;
  completeMultipartUpload(key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  /** Size of the object, or null when it does not exist. */
  sizeOf(key: string): Promise<number | null>;
  /**
   * Address the browser GETs the object from. `contentDisposition` makes the storage answer with
   * that header, so a download is saved instead of rendered.
   */
  presignGet(key: string, expiresInSeconds: number, contentDisposition?: string): Promise<string>;
  /**
   * Address the browser PUTs a whole object to (a single request, for small files). The length is
   * part of the signature, so the storage refuses a body of any other size.
   */
  presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<string>;
  readText(key: string): Promise<string>;
  putText(key: string, body: string, contentType: string): Promise<void>;
  /** Deletes one object; a missing key is not an error. */
  deleteObject(key: string): Promise<void>;
  downloadToFile(key: string, filePath: string): Promise<void>;
  uploadFile(key: string, filePath: string, contentType: string): Promise<void>;
  /** Deletes every object whose key starts with the prefix. */
  deletePrefix(prefix: string): Promise<void>;
  /** Lets the web app PUT parts and read segments straight from the storage. */
  allowBrowserAccess(origins: readonly string[]): Promise<void>;
}

/** Longest a presigned address can live (S3 allows seven days). */
export const MAX_PRESIGN_SECONDS = 7 * 24 * 3600;

export function createS3Storage(config: Config): Storage {
  const credentials = {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  };
  const common = {
    region: config.S3_REGION,
    credentials,
    forcePathStyle: true,
    // the SDK would otherwise sign a checksum of an empty body into every upload address
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  };
  const client = new S3Client({
    ...common,
    endpoint: config.S3_ENDPOINT,
    // a stalled storage must fail the job, not hold its slot forever; requestTimeout is idle time
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 },
  });
  // a presigned address is bound to its host, so browsers need it signed for the public one
  const publicClient = new S3Client({ ...common, endpoint: config.S3_PUBLIC_URL });
  const Bucket = config.S3_BUCKET;

  return {
    async startMultipartUpload(key, contentType) {
      const result = await client.send(
        new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }),
      );
      if (!result.UploadId) throw new Error('The storage did not return an upload id');
      return result.UploadId;
    },
    presignUploadPart: (key, uploadId, partNumber, sizeBytes, expiresInSeconds) =>
      getSignedUrl(
        publicClient,
        new UploadPartCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          ContentLength: sizeBytes,
        }),
        { expiresIn: expiresInSeconds },
      ),
    async completeMultipartUpload(key, uploadId, parts) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
          },
        }),
      );
    },
    async abortMultipartUpload(key, uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
    },
    async sizeOf(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode;
        if (status === 404) return null;
        throw error;
      }
    },
    presignGet: (key, expiresInSeconds, contentDisposition) =>
      getSignedUrl(
        publicClient,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {}),
        }),
        { expiresIn: Math.min(expiresInSeconds, MAX_PRESIGN_SECONDS) },
      ),
    presignPut: (key, contentType, sizeBytes, expiresInSeconds) =>
      getSignedUrl(
        publicClient,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: sizeBytes,
        }),
        { expiresIn: Math.min(expiresInSeconds, MAX_PRESIGN_SECONDS) },
      ),
    async readText(key) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return result.Body!.transformToString();
    },
    async putText(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async downloadToFile(key, filePath) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      await pipeline(result.Body as Readable, createWriteStream(filePath));
    },
    async uploadFile(key, filePath, contentType) {
      // stat before opening the stream, so a failure here cannot leak the file descriptor
      const { size } = await stat(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentType: contentType,
          ContentLength: size,
        }),
      );
    },
    async deletePrefix(prefix) {
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [{ Key: item.Key }] : []));
        if (keys.length > 0) {
          const deleted = await client.send(
            new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }),
          );
          // quiet mode still reports the keys it could not delete
          if (deleted.Errors?.length) {
            throw new Error('The storage could not delete ' + deleted.Errors.length + ' objects');
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    },
    async allowBrowserAccess(origins) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [...origins],
                AllowedMethods: ['GET', 'HEAD', 'PUT'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    },
  };
}
