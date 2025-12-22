import { Role } from '@prisma/client';

export interface AuthPayload {
  sub: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
