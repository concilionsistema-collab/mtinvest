'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';

const CENTRO_NOVA_MUTUM: [number, number] = [-56.0839, -13.8372];
const CAMADA_PREDIOS_3D = 'crm-predios-3d';
const FONTE_SATELITE = 'crm-satelite-esri';
const CAMADA_SATELITE = 'crm-satelite-esri-layer';

const PONTOS = [
  { lng: -56.0839, lat: -13.8372, label: '12', status: 'disponivel', titulo: 'Setor Central', imovel: 'Casa Centro', preco: 'R$ 1.250.000', foto: 1, imagem: '/property-featured-hq.png' },
  { lng: -56.0915, lat: -13.8280, label: '15', status: 'vendido', titulo: 'Setor Norte', imovel: 'Residencial Nova Mutum', preco: 'R$ 2.800.000', foto: 2 },
  { lng: -56.0736, lat: -13.8310, label: '8', status: 'negociacao', titulo: 'Setor Leste', imovel: 'Comercial Av. Mutum', preco: 'R$ 850.000', foto: 3 },
  { lng: -56.0930, lat: -13.8470, label: '5', status: 'negociacao', titulo: 'Setor Oeste', imovel: 'Casa Jardim', preco: 'R$ 980.000', foto: 1 },
  { lng: -56.0750, lat: -13.8495, label: '7', status: 'disponivel', titulo: 'Setor Sul', imovel: 'Sobrado Florais', preco: 'R$ 1.690.000', foto: 2 },
  { lng: -56.0820, lat: -13.8580, label: '10', status: 'vendido', titulo: 'Expansão Urbana', imovel: 'Galpão Comercial', preco: 'R$ 1.100.000', foto: 3 },
  { lng: -56.0790, lat: -13.8420, label: '3', status: 'alugado', titulo: 'Setor Comercial', imovel: 'Sala Comercial', preco: 'R$ 3.500/mês', foto: 2 },
] as const;

const IMOVEIS_NO_MAPA = [
  { posicao: 'superior-esquerda', lng: -56.0839, lat: -13.8372, titulo: 'Casa Centro', preco: 'R$ 1.250.000', detalhes: '210m² · 3 suítes', status: 'Disponível', imagem: '/property-featured-hq.png' },
  { posicao: 'inferior-esquerda', lng: -56.0915, lat: -13.8280, titulo: 'Residencial Nova Mutum', preco: 'R$ 2.800.000', detalhes: '320m² · 4 suítes', status: 'Em negociação', foto: 2 },
  { posicao: 'superior-direita', lng: -56.0736, lat: -13.8310, titulo: 'Comercial Av. Mutum', preco: 'R$ 850.000', detalhes: '180m² · térreo', status: 'Disponível', foto: 3 },
  { posicao: 'inferior-direita', lng: -56.0930, lat: -13.8470, titulo: 'Casa Jardim', preco: 'R$ 980.000', detalhes: '195m² · 3 quartos', status: 'Em negociação', foto: 1 },
  { posicao: 'superior-direita', lng: -56.0790, lat: -13.8420, titulo: 'Sala Comercial', preco: 'R$ 3.500/mês', detalhes: '45m² · mobiliado', status: 'Alugado', foto: 2 },
] as const;

export function MapLibreSalesMap({ appearance = 'satellite' }: { appearance?: 'satellite' | 'dark' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const marcadoresRef = useRef<Array<{ marker: maplibregl.Marker, status: string }>>([]);
  const [erro, setErro] = useState(false);
  const [modo3d, setModo3d] = useState(false);
  const [filtroAtual, setFiltroAtual] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getCount = (s: string) => {
    let count = 0;
    PONTOS.forEach(p => { if (p.status === s) count += Number(p.label); });
    IMOVEIS_NO_MAPA.forEach(i => {
      let st = i.status.toLowerCase();
      if (st === 'em negociação') st = 'negociacao';
      if (st === 'disponível') st = 'disponivel';
      if (st === s) count += 1;
    });
    return count;
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const mapa = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: CENTRO_NOVA_MUTUM,
      zoom: 15.4,
      maxZoom: 17,
      pitch: 0,
      bearing: 0,
      maxPitch: 60,
      attributionControl: { compact: true },
    });
    mapRef.current = mapa;

    mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    mapa.on('load', () => {
      const camadas = mapa.getStyle().layers ?? [];
      const primeiraCamadaDeTexto = camadas.find((camada) => camada.type === 'symbol')?.id;

      if (appearance === 'dark') {
        camadas.forEach((camada) => {
          const id = camada.id.toLowerCase();
          if (camada.type === 'background') mapa.setPaintProperty(camada.id, 'background-color', '#09192b');
          if (camada.type === 'fill') {
            const cor = id.includes('water') ? '#0a2d49' : id.includes('park') || id.includes('landuse') ? '#0d2a2b' : id.includes('building') ? '#14283a' : '#0c1d30';
            mapa.setPaintProperty(camada.id, 'fill-color', cor);
            mapa.setPaintProperty(camada.id, 'fill-opacity', id.includes('building') ? 0.64 : 0.9);
          }
          if (camada.type === 'line') {
            const cor = id.includes('road') || id.includes('street') ? '#45505c' : id.includes('water') ? '#174264' : '#263a50';
            mapa.setPaintProperty(camada.id, 'line-color', cor);
            mapa.setPaintProperty(camada.id, 'line-opacity', id.includes('road') || id.includes('street') ? 0.84 : 0.62);
          }
          if (camada.type === 'symbol') {
            mapa.setPaintProperty(camada.id, 'text-color', '#c3ccd5');
            mapa.setPaintProperty(camada.id, 'text-halo-color', '#071522');
            mapa.setPaintProperty(camada.id, 'text-halo-width', 1);
          }
        });
      }

      camadas
        .filter((camada) => camada.type === 'fill-extrusion')
        .forEach((camada) => mapa.setLayoutProperty(camada.id, 'visibility', 'none'));

      if (mapa.getSource('openmaptiles') && !mapa.getLayer(CAMADA_PREDIOS_3D)) {
        mapa.addLayer({
          id: CAMADA_PREDIOS_3D,
          source: 'openmaptiles',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['zoom'],
              14, '#193b48',
              16, '#2f6678',
              18, '#65a0b4',
            ],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
            'fill-extrusion-opacity': 0.68,
          },
        }, primeiraCamadaDeTexto);
      }

      if (appearance === 'satellite') {
      mapa.addSource(FONTE_SATELITE, {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 17,
        attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      });

      mapa.addLayer({
        id: CAMADA_SATELITE,
        type: 'raster',
        source: FONTE_SATELITE,
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
          'raster-contrast': 0.06,
          'raster-saturation': 0.08,
        },
      }, mapa.getLayer(CAMADA_PREDIOS_3D) ? CAMADA_PREDIOS_3D : primeiraCamadaDeTexto);
      }

      PONTOS.forEach((ponto) => {
        const elemento = document.createElement('button');
        elemento.type = 'button';
        elemento.className = `maplibre-crm-marker maplibre-crm-marker--${ponto.status}`;
        elemento.textContent = ponto.label;
        elemento.setAttribute('aria-label', `${ponto.label} imóveis em ${ponto.titulo}`);

        const fotoDoImovel = 'imagem' in ponto
          ? `<img class="maplibre-popup-photo" src="${ponto.imagem}" alt="${ponto.imovel}">`
          : `<div class="maplibre-popup-photo photo-${ponto.foto}"></div>`;
        const popup = new maplibregl.Popup({ offset: 20, closeButton: false, maxWidth: '310px' }).setHTML(`
          ${fotoDoImovel}
          <small>${ponto.titulo} · ${ponto.label} imóveis</small>
          <strong>${ponto.imovel}</strong>
          <b>${ponto.preco}</b>
          <span>Ver imóvel cadastrado</span>
        `);

        const marcador = new maplibregl.Marker({ element: elemento, anchor: 'bottom' })
          .setLngLat([ponto.lng, ponto.lat])
          .setPopup(popup)
          .addTo(mapa);
          
        marcadoresRef.current.push({ marker: marcador, status: ponto.status });
      });

      const cartoesGeograficos: Array<{
        cartao: HTMLButtonElement;
        lng: number;
        lat: number;
      }> = [];

      (appearance === 'dark' ? IMOVEIS_NO_MAPA.slice(0, 3) : IMOVEIS_NO_MAPA).forEach((imovel) => {
        const raiz = document.createElement('div');
        raiz.className = 'maplibre-property-marker';

        const cartao = document.createElement('button');
        cartao.type = 'button';
        cartao.className = 'maplibre-property-card';
        cartao.setAttribute('aria-label', `${imovel.titulo}, localizado nas coordenadas cadastradas`);

        if ('imagem' in imovel) {
          const imagem = document.createElement('img');
          imagem.className = 'maplibre-property-card__photo';
          imagem.src = imovel.imagem;
          imagem.alt = imovel.titulo;
          cartao.appendChild(imagem);
        } else {
          const imagem = document.createElement('span');
          imagem.className = `maplibre-property-card__photo photo-${imovel.foto}`;
          cartao.appendChild(imagem);
        }

        const situacao = document.createElement('small');
        situacao.innerHTML = '<i></i>';
        situacao.append(imovel.status);
        const titulo = document.createElement('b');
        titulo.textContent = imovel.titulo;
        const preco = document.createElement('strong');
        preco.textContent = imovel.preco;
        const detalhes = document.createElement('span');
        detalhes.textContent = imovel.detalhes;
        cartao.append(situacao, titulo, preco, detalhes);

        cartao.addEventListener('click', (evento) => {
          evento.stopPropagation();
          mapa.flyTo({ center: [imovel.lng, imovel.lat], zoom: 16.2, duration: 700 });
        });
        raiz.appendChild(cartao);

        new maplibregl.Marker({ element: raiz, anchor: 'bottom', offset: [0, -25] })
          .setLngLat([imovel.lng, imovel.lat])
          .addTo(mapa);

        let s = imovel.status.toLowerCase();
        if (s === 'em negociação') s = 'negociacao';
        if (s === 'disponível') s = 'disponivel';
        
        // Push fake marker to ref for filtering (we hide the element)
        marcadoresRef.current.push({ marker: { getElement: () => raiz } as any, status: s });
        
        cartoesGeograficos.push({ cartao, lng: imovel.lng, lat: imovel.lat });
      });

      function atualizarEscalaDosCartoes() {
        const zoom = mapa.getZoom();
        const centro = mapa.getCenter();
        const escalaDoZoom = Math.min(1.08, Math.max(0.56, 0.56 + (zoom - 13) * 0.16));

        cartoesGeograficos.forEach(({ cartao, lng, lat }) => {
          const distanciaEmKm = centro.distanceTo(new maplibregl.LngLat(lng, lat)) / 1000;
          const escalaDaDistancia = Math.min(1, Math.max(0.72, 1 - distanciaEmKm * 0.055));
          const escalaFinal = escalaDoZoom * escalaDaDistancia;
          cartao.style.setProperty('--property-card-scale', escalaFinal.toFixed(3));
          cartao.style.opacity = String(Math.min(1, 0.76 + escalaFinal * 0.22));
        });
      }

      mapa.on('move', atualizarEscalaDosCartoes);
      atualizarEscalaDosCartoes();
    });

    mapa.on('error', () => {
      if (!mapa.isStyleLoaded()) setErro(true);
    });

    return () => {
      mapRef.current = null;
      marcadoresRef.current = [];
      mapa.remove();
    };
  }, [appearance]);

  useEffect(() => {
    const handleFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => mapRef.current?.resize(), 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    marcadoresRef.current.forEach(({ marker, status }) => {
      const el = marker.getElement();
      if (!filtroAtual) {
        el.style.display = '';
      } else {
        el.style.display = status === filtroAtual ? '' : 'none';
      }
    });
  }, [filtroAtual]);

  function definirPerspectiva(ativar3d: boolean) {
    const mapa = mapRef.current;
    setModo3d(ativar3d);
    if (!mapa) return;

    if (mapa.getLayer(CAMADA_PREDIOS_3D)) {
      mapa.setLayoutProperty(CAMADA_PREDIOS_3D, 'visibility', ativar3d ? 'visible' : 'none');
    }
    mapa.easeTo({ pitch: ativar3d ? 46 : 0, bearing: ativar3d ? -18 : 0, duration: 650 });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      fullScreenRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <>
      {appearance === 'satellite' && (
        <div className="map-toolbar">
          <small>Visualização dos imóveis e negociações por localização</small>
          <div>
            <button onClick={() => setFiltroAtual(null)}>Todos os imóveis⌄</button>
            <span style={{ opacity: filtroAtual && filtroAtual !== 'disponivel' ? 0.3 : 1, cursor: 'pointer', transition: 'opacity 0.2s' }} onClick={() => setFiltroAtual(f => f === 'disponivel' ? null : 'disponivel')}>○ Disponível ({getCount('disponivel')})</span>
            <span style={{ opacity: filtroAtual && filtroAtual !== 'negociacao' ? 0.3 : 1, cursor: 'pointer', transition: 'opacity 0.2s' }} onClick={() => setFiltroAtual(f => f === 'negociacao' ? null : 'negociacao')}>○ Em negociação ({getCount('negociacao')})</span>
            <span style={{ opacity: filtroAtual && filtroAtual !== 'vendido' ? 0.3 : 1, cursor: 'pointer', transition: 'opacity 0.2s' }} onClick={() => setFiltroAtual(f => f === 'vendido' ? null : 'vendido')}>○ Vendido ({getCount('vendido')})</span>
            <span style={{ opacity: filtroAtual && filtroAtual !== 'alugado' ? 0.3 : 1, cursor: 'pointer', transition: 'opacity 0.2s' }} onClick={() => setFiltroAtual(f => f === 'alugado' ? null : 'alugado')}>○ Alugado ({getCount('alugado')})</span>
          </div>
        </div>
      )}
      <div className="map-stage" ref={fullScreenRef}>
        <div className="maplibre-wrap">
          <div ref={containerRef} className="maplibre-map" aria-label={appearance === 'dark' ? 'Mapa escuro de imóveis por localização' : 'Mapa aéreo de imóveis com cobertura nacional e foco inicial em Nova Mutum'} />
      {erro && <div className="maplibre-error">Não foi possível carregar os dados do mapa.</div>}
      {appearance === 'satellite' && <div className="maplibre-view-controls" aria-label="Perspectiva do mapa">
        <button type="button" className={!modo3d ? 'active' : ''} aria-pressed={!modo3d} onClick={() => definirPerspectiva(false)}>Aérea</button>
        <button type="button" className={modo3d ? 'active' : ''} aria-pressed={modo3d} onClick={() => definirPerspectiva(true)}>3D</button>
        <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Sair da tela cheia' : 'Ver em tela cheia'}><span className="fluent" style={{ fontSize: '12px' }}>{isFullscreen ? '\uE73F' : '\uE740'}</span></button>
      </div>}
        {appearance === 'satellite' && <div className="maplibre-brand"><span className="fluent">&#xE707;</span><img src="/cionlaris-logo-transparent.png" alt="CIONLARIS Maps" style={{ height: '14px', margin: '2px 0 1px' }} /><small>Imagem aérea contínua · cobertura nacional</small></div>}
        </div>
      </div>
    </>
  );
}
