import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseCover, generateCoverShapes } from './CourseCover';

describe('generateCoverShapes', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(generateCoverShapes('course-1')).toEqual(generateCoverShapes('course-1'));
    expect(generateCoverShapes('course-1')).not.toEqual(generateCoverShapes('course-2'));
  });

  it('keeps shapes inside sensible bounds', () => {
    for (const shape of generateCoverShapes('course-1')) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.x).toBeLessThanOrEqual(160);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeLessThanOrEqual(90);
      expect(shape.opacity).toBeGreaterThan(0);
      expect(shape.opacity).toBeLessThan(1);
    }
  });
});

describe('CourseCover', () => {
  it('renders the image when there is one', () => {
    const { container } = render(<CourseCover imageUrl="/cover.png" seed="course-1" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/cover.png');
    expect(screen.queryByTestId('generated-cover')).toBeNull();
  });

  it('draws a generated cover without an image', () => {
    render(<CourseCover imageUrl={null} seed="course-1" />);
    expect(screen.getByTestId('generated-cover')).toBeInTheDocument();
  });
});
