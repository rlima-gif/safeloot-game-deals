'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import type { GameDetails } from '@/lib/game-api';
import type { GameProfile } from '@/lib/game-profile';
import { GameTrailer } from './game-editorial';

function Gallery({ profile }: { profile: GameProfile }) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState(false);
  const images = profile.screenshots,
    current = images[index];
  if (!current) return null;
  const select = (value: number) => {
    setIndex((value + images.length) % images.length);
    setFailed(false);
  };
  return (
    <section className="profile-gallery" aria-labelledby="gallery-heading">
      <div className="panel-heading">
        <h2 id="gallery-heading">Dentro do jogo</h2>
        <span aria-live="polite">
          {index + 1} / {images.length}
        </span>
      </div>
      <div className="profile-stage">
        {failed ? (
          <p>Imagem indisponível. Escolha outra captura.</p>
        ) : (
          <a
            href={current.full}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir captura ${index + 1} de ${profile.title} em tamanho original`}
          >
            <Image
              unoptimized
              width={1920}
              height={1080}
              key={current.full}
              src={current.full}
              alt={`Captura ${index + 1} de ${profile.title}`}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          </a>
        )}
      </div>
      <div className="profile-gallery-controls">
        <button
          type="button"
          onClick={() => select(index - 1)}
          aria-label="Captura anterior"
          disabled={images.length < 2}
        >
          <ChevronLeft size={20} />
        </button>
        <span>
          Capturas oficiais ·{' '}
          <a href={current.full} target="_blank" rel="noreferrer">
            Ampliar ↗
          </a>
        </span>
        <button
          type="button"
          onClick={() => select(index + 1)}
          aria-label="Próxima captura"
          disabled={images.length < 2}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <fieldset className="profile-thumbnails" aria-label="Escolher captura">
        {images.map((image, i) => (
          <button
            key={image.full}
            type="button"
            aria-label={`Mostrar captura ${i + 1}`}
            aria-pressed={i === index}
            onClick={() => select(i)}
          >
            <Image
              unoptimized
              width={110}
              height={62}
              src={image.thumbnail}
              alt=""
              loading="lazy"
            />
          </button>
        ))}
      </fieldset>
    </section>
  );
}
export function GameProfilePanel({ game }: { game: GameDetails }) {
  const [profile, setProfile] = useState<GameProfile | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/game-profile?id=${game.id}`, {
      signal: controller.signal,
      cache: 'no-cache',
    })
      .then(async (response) => {
        const data = (await response.json()) as GameProfile & {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || 'Ficha indisponível');
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setProfile(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [game.id, retry]);
  if (!profile)
    return (
      <section className="about-game profile-loading">
        <h2>Sobre o jogo</h2>
        <p>{game.description}</p>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              className="secondary-link"
              type="button"
              onClick={() => {
                setError('');
                setRetry(retry + 1);
              }}
            >
              Tentar novamente
            </button>
            <GameTrailer game={game} />
          </div>
        ) : (
          <output>
            <Images size={18} /> Carregando imagens e ficha do jogo…
          </output>
        )}
      </section>
    );
  const facts = [
    ['Desenvolvedora', profile.developers.join(' · ')],
    ['Publicadora', profile.publishers.join(' · ')],
    [
      profile.comingSoon ? 'Lançamento previsto' : 'Lançamento na Steam',
      profile.releaseDate,
    ],
    ['Plataformas na Steam', profile.platforms.join(' · ')],
    ['Gêneros', profile.genres.join(' · ')],
    ['Modos de jogo', profile.modes.join(' · ')],
  ];
  return (
    <div className="game-profile">
      <section className="about-game">
        <div className="panel-heading">
          <h2>Sobre {profile.title}</h2>
          {profile.website && (
            <a
              className="secondary-link"
              href={profile.website}
              target="_blank"
              rel="noreferrer"
            >
              Site oficial <ArrowUpRight size={14} />
            </a>
          )}
        </div>
        <p>
          {profile.description ||
            game.description ||
            'Sinopse não informada pela desenvolvedora.'}
        </p>
        <dl className="profile-facts">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        {!!profile.categories.length && (
          <div className="profile-tags" aria-label="Recursos e categorias">
            {profile.categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
        )}
      </section>
      <Gallery key={`gallery-${profile.id}`} profile={profile} />
      <GameTrailer
        key={`trailer-${profile.id}`}
        game={{ ...game, ...profile }}
      />
      {!!profile.requirements.length && (
        <section
          className="profile-requirements"
          aria-labelledby="requirements-heading"
        >
          <div className="panel-heading">
            <h2 id="requirements-heading">Seu PC roda?</h2>
            <span>Requisitos da desenvolvedora</span>
          </div>
          {profile.requirements.map((requirement) => (
            <details
              key={requirement.platform}
              open={requirement.platform === profile.platforms[0]}
            >
              <summary>{requirement.platform}</summary>
              <div className="requirements-grid">
                {requirement.minimum && (
                  <div>
                    <h3>Mínimos</h3>
                    <p>{requirement.minimum}</p>
                  </div>
                )}
                {requirement.recommended && (
                  <div>
                    <h3>Recomendados</h3>
                    <p>{requirement.recommended}</p>
                  </div>
                )}
              </div>
            </details>
          ))}
        </section>
      )}
      {profile.languages && (
        <details className="profile-languages">
          <summary>Idiomas disponíveis</summary>
          <p>{profile.languages}</p>
        </details>
      )}
      <footer className="profile-sources">
        <p>
          {profile.stale
            ? 'Exibindo a última ficha salva; a fonte está indisponível agora.'
            : 'Ficha preenchida automaticamente.'}{' '}
          Atualizada em{' '}
          {new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeZone: 'America/Sao_Paulo',
          }).format(new Date(profile.updatedAt))}
          .
        </p>
        <div>
          {profile.sources.map((source, i) => (
            <a
              href={source.url}
              key={`${source.url}-${i}`}
              target="_blank"
              rel="noreferrer"
            >
              {source.name} ↗
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
