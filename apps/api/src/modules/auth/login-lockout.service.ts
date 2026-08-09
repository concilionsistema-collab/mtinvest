import { Injectable } from '@nestjs/common';

interface RegistroDeTentativas {
  contagem: number;
  primeiraTentativaEm: number;
  bloqueadoAte: number | null;
}

const JANELA_CONTAGEM_MS = 15 * 60 * 1000;
const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS_FALHAS = 5;

function chave(tenantId: string, email: string): string {
  return `${tenantId}:${email.toLowerCase()}`;
}

/**
 * Fecha a pendência "sem rate limiting no login" (README) do lado que
 * importa de verdade: um atacante tentando adivinhar a senha de UMA conta
 * específica, mesmo trocando de IP a cada tentativa (o que o throttling por
 * IP do ThrottlerModule, sozinho, não pega). Bloqueia por (tenantId, email)
 * após 5 falhas em 15 minutos, por 15 minutos.
 *
 * SIMPLIFICAÇÃO REGISTRADA: estado em memória do próprio processo (Map) -
 * não sobrevive a um restart nem funciona corretamente se a API rodar em
 * mais de uma instância (precisaria de um armazenamento compartilhado, ex.
 * Redis). Consistente com o resto do sistema hoje, que roda como um único
 * processo (sem horizontal scaling configurado em nenhum lugar).
 */
@Injectable()
export class LoginLockoutService {
  private readonly tentativas = new Map<string, RegistroDeTentativas>();

  estaBloqueado(tenantId: string, email: string): boolean {
    const registro = this.tentativas.get(chave(tenantId, email));
    if (!registro || !registro.bloqueadoAte) {
      return false;
    }
    if (Date.now() >= registro.bloqueadoAte) {
      this.tentativas.delete(chave(tenantId, email));
      return false;
    }
    return true;
  }

  registrarFalha(tenantId: string, email: string): void {
    const agora = Date.now();
    const k = chave(tenantId, email);
    const registro = this.tentativas.get(k);

    if (!registro || agora - registro.primeiraTentativaEm > JANELA_CONTAGEM_MS) {
      this.tentativas.set(k, { contagem: 1, primeiraTentativaEm: agora, bloqueadoAte: null });
      return;
    }

    registro.contagem += 1;
    if (registro.contagem >= MAX_TENTATIVAS_FALHAS) {
      registro.bloqueadoAte = agora + DURACAO_BLOQUEIO_MS;
    }
  }

  limparFalhas(tenantId: string, email: string): void {
    this.tentativas.delete(chave(tenantId, email));
  }
}
