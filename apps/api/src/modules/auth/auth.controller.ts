import { loginBodySchema, registerBodySchema } from '@ruut/shared';
import type { Request, Response } from 'express';
import { requireAuthUser } from '../../middleware/auth.js';
import type { AuthService } from './auth.service.js';

export interface AuthController {
  register(req: Request, res: Response): Promise<void>;
  login(req: Request, res: Response): Promise<void>;
  me(req: Request, res: Response): Promise<void>;
}

/** HTTP translation only: parse the input, call the service, shape the response. */
export function createAuthController(authService: AuthService): AuthController {
  return {
    async register(req, res) {
      const body = registerBodySchema.parse(req.body);
      const result = await authService.register(body);
      res.status(201).json({ data: result });
    },

    async login(req, res) {
      const body = loginBodySchema.parse(req.body);
      const result = await authService.login(body);
      res.status(200).json({ data: result });
    },

    async me(req, res) {
      const user = await authService.getCurrentUser(requireAuthUser(req).id);
      res.status(200).json({ data: { user } });
    },
  };
}
