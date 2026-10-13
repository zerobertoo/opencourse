import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs } from '@/test/mock-services';

describe('mock video service', () => {
  it('has no failed videos, because the demo encoder never fails', async () => {
    const { services } = await createServicesSignedInAs('marina');
    expect(await services.video.listFailed()).toEqual([]);
    await expect(services.video.retry('missing')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps the failed list for admins', async () => {
    const instructor = (await createServicesSignedInAs('rafael')).services;
    await expect(instructor.video.listFailed()).rejects.toMatchObject({ code: 'forbidden' });
  });
});
