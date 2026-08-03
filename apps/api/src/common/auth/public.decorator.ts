import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca um endpoint como isento do JwtAuthGuard (hoje, só POST /auth/login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
