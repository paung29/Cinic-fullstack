export async function captureWithinBoundary<T>(beginCaptureBoundary: () => () => void, capture: () => Promise<T>): Promise<T> {
  const endCapture = beginCaptureBoundary();
  try {
    return await capture();
  } finally {
    endCapture();
  }
}
