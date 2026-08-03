'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Unidade } from '@crm/shared';
import { useAuth } from '../../components/auth-context';
import { apiFetch } from '../../lib/api';
import { buttonStyle, cardStyle, inputStyle } from '../../lib/styles';

export default function UnidadesPage() {
  const { sessao } = useAuth(); const [nomeFantasia,setNomeFantasia]=useState(''); const [unidades,setUnidades]=useState<Unidade[]>([]); const [erro,setErro]=useState<string|null>(null); const [carregando,setCarregando]=useState(false);
  async function carregar(){try{setUnidades(await apiFetch<Unidade[]>('/unidades'));}catch{setErro('Falha ao listar unidades.');}}
  useEffect(()=>{carregar();},[sessao?.tenantId]);
  async function criar(e:FormEvent<HTMLFormElement>){e.preventDefault();setCarregando(true);try{await apiFetch('/unidades',{method:'POST',body:JSON.stringify({nomeFantasia})});setNomeFantasia('');await carregar();}catch{setErro('Falha ao criar unidade.');}finally{setCarregando(false);}}
  if(!sessao)return null;
  return <main><h1>Unidades da rede</h1><form onSubmit={criar} style={{display:'flex',gap:12,margin:'24px 0'}}><input aria-label="Nome fantasia" value={nomeFantasia} onChange={e=>setNomeFantasia(e.target.value)} required style={{...inputStyle,flex:1}} placeholder="Nome fantasia da unidade"/><button style={buttonStyle} disabled={carregando}>{carregando?'Salvando...':'Cadastrar unidade'}</button></form>{erro&&<p>{erro}</p>}{unidades.map(u=><div style={cardStyle} key={u.id}><b>{u.nomeFantasia}</b></div>)}</main>;
}
