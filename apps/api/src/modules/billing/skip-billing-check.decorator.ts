import { SetMetadata } from '@nestjs/common';

// Mesmo espirito de @Public() (common/auth/public.decorator.ts), mas para o
// BillingGuard: a rota continua exigindo login (JwtAuthGuard normal), só
// fica isenta do bloqueio por assinatura vencida/inadimplente - necessário
// para as próprias rotas de cobrança (senão um tenant bloqueado não
// conseguiria nem ver o status nem pagar para se desbloquear) e para
// logout (sempre deve funcionar, mesmo com a assinatura vencida).
export const SKIP_BILLING_CHECK_KEY = 'skipBillingCheck';
export const SkipBillingCheck = () => SetMetadata(SKIP_BILLING_CHECK_KEY, true);
