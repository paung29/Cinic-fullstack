import { z } from 'zod';

// Static CSP rejects Zod's runtime Function() JIT probe. Eden's validation
// volume is small, so always use Zod's CSP-safe interpreter path instead.
z.config({ jitless: true });

export { z };
