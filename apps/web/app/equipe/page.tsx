'use client';

import { FormEvent, useEffect, useState, useRef } from 'react';
import type { Usuario, UsuarioPerfil } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch, apiFetchBlob, ApiError } from '../../lib/api';
import { buttonStyle, cardStyle, inputStyle } from '../../lib/styles';

// Usamos apenas os perfis disponíveis no momento no banco.
// O backend restringe a criação (GESTOR_UNIDADE só pode criar GESTOR_UNIDADE se ele for também).
const PERFIS: UsuarioPerfil[] = ['GESTOR_UNIDADE', 'CORRETOR'];
const ROTULOS_PERFIL: Record<UsuarioPerfil, string> = {
  GESTOR_UNIDADE: 'Gestor da Unidade / Administrador',
  CORRETOR: 'Corretor',
};

export default function EquipePage() {
  const { sessao } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState<UsuarioPerfil>('CORRETOR');
  const [salvando, setSalvando] = useState(false);

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Controla o cache das imagens usando timestamp
  const [imageTokens, setImageTokens] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [usuarioSelecionadoParaFoto, setUsuarioSelecionadoParaFoto] = useState<string | null>(null);

  async function carregar() {
    try {
      setUsuarios(await apiFetch<Usuario[]>('/usuarios'));
    } catch {
      setErro('Falha ao carregar a equipe.');
    }
  }

  useEffect(() => {
    if (!sessao) return;
    carregar();
  }, [sessao?.tenantId]);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch('/usuarios', {
        method: 'POST',
        body: JSON.stringify({
          unidadeId: sessao?.unidadeId,
          nome,
          email,
          senha,
          perfil,
        }),
      });
      setNome('');
      setEmail('');
      setSenha('');
      await carregar();
    } catch (e: any) {
      setErro(e instanceof ApiError && e.status === 400 ? 'Erro de validação ou permissão (apenas gestores podem criar gestores).' : 'Falha ao cadastrar usuário.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirSeletorFoto(id: string) {
    setUsuarioSelecionadoParaFoto(id);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !usuarioSelecionadoParaFoto) return;

    setUploadingId(usuarioSelecionadoParaFoto);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      await apiFetch(`/usuarios/${usuarioSelecionadoParaFoto}/foto`, {
        method: 'POST',
        body: formData,
      });

      // Recarrega a lista (atualiza usuario.temFotoPerfil - crucial no
      // primeiro upload, quando ainda é false) e ainda assim bumpa o token,
      // pra forçar a busca da imagem mesmo quando temFotoPerfil já era true
      // (reenvio de foto sobre uma que já existia).
      await carregar();
      setImageTokens(prev => ({ ...prev, [usuarioSelecionadoParaFoto]: Date.now() }));
    } catch {
      setErro('Falha ao fazer upload da foto. Use uma imagem JPEG, PNG ou WebP de até 5 MB.');
    } finally {
      setUploadingId(null);
      setUsuarioSelecionadoParaFoto(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Componente de Avatar com fallback. A foto é servida por uma rota
  // autenticada (JwtAuthGuard é global) - uma <img src="..."> comum não
  // envia o header Authorization, então busca-se o Blob via apiFetchBlob e
  // monta-se um object URL. temFotoPerfil evita a chamada de rede (sempre
  // 404) para quem nunca fez upload.
  const Avatar = ({ usuario }: { usuario: Usuario }) => {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const token = imageTokens[usuario.id] || 0;

    useEffect(() => {
      if (!usuario.temFotoPerfil) {
        setObjectUrl(null);
        return;
      }
      let cancelado = false;
      let urlCriada: string | null = null;
      apiFetchBlob(`/usuarios/${usuario.id}/foto`)
        .then((blob) => {
          if (cancelado || !blob) return;
          urlCriada = URL.createObjectURL(blob);
          setObjectUrl(urlCriada);
        })
        .catch(() => {
          if (!cancelado) setObjectUrl(null);
        });
      return () => {
        cancelado = true;
        if (urlCriada) URL.revokeObjectURL(urlCriada);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usuario.id, usuario.temFotoPerfil, token]);

    if (!objectUrl) {
      const iniciais = usuario.nome.substring(0, 2).toUpperCase();
      return (
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--purple)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 }}>
          {iniciais}
        </div>
      );
    }

    return (
      <img
        src={objectUrl}
        alt={`Foto de ${usuario.nome}`}
        style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-hover)' }}
      />
    );
  };

  if (!sessao) return null;
  if (!usuarios) return <main><h1>Equipe</h1><p>Carregando...</p></main>;

  return (
    <main>
      <h1>Equipe</h1>
      <p style={{ color: 'var(--muted)', fontSize: 12 }}>
        Cadastro de corretores, gestores e sócios da unidade. 
        Adicione membros e gerencie as fotos de perfil.
      </p>
      {erro && <p style={{ color: 'var(--danger)' }}>{erro}</p>}

      <form onSubmit={criar} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0', alignItems: 'center' }}>
        <input aria-label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required style={{ ...inputStyle, flex: 1, minWidth: 180 }} placeholder="Nome completo" />
        <input aria-label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} placeholder="E-mail" />
        <input aria-label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={inputStyle} placeholder="Senha (mín. 8)" minLength={8} />
        <select aria-label="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as UsuarioPerfil)} style={inputStyle}>
          {PERFIS.map((p) => <option key={p} value={p}>{ROTULOS_PERFIL[p]}</option>)}
        </select>
        <button style={buttonStyle} disabled={salvando}>{salvando ? 'Salvando...' : 'Cadastrar membro'}</button>
      </form>

      {/* Input oculto para upload de foto */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFotoChange} />

      {usuarios.length === 0 && <p style={{ color: 'var(--muted)' }}>Nenhuma pessoa na equipe ainda.</p>}
      
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {usuarios.map((u) => (
          <div style={{ ...cardStyle, display: 'flex', gap: 16, alignItems: 'center' }} key={u.id}>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => abrirSeletorFoto(u.id)} title="Clique para alterar a foto">
              <Avatar usuario={u} />
              {uploadingId === u.id && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                  Enviando
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ display: 'block', fontSize: 16 }}>{u.nome}</b>
              <small style={{ color: 'var(--muted)', display: 'block' }}>{ROTULOS_PERFIL[u.perfil]}</small>
              <small style={{ color: 'var(--muted)', display: 'block' }}>{u.email}</small>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
