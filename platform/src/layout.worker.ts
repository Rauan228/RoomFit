import { smartLayouts } from "@roomfit/core";
self.onmessage = (event) => {
  try {
    self.postMessage({
      variants: smartLayouts(event.data.floor, event.data.variant),
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
