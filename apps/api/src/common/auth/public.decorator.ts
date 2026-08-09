import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca um endpoint como isento do JwtAuthGuard (login/refresh/logout, e GET /portal/contratos/:token — US-113, quem acessa nunca tem JWT). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
