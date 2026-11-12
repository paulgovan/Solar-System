// Feature: screenshot button (PNG with labels, date and credit; copies the share link).
// See src/ui/screenshot.js.

import { initScreenshot } from '../ui/screenshot.js';

export default {
  id: 'screenshot',
  setup(app) {
    this.tool = initScreenshot(app);
  },
};
