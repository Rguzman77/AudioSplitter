import { useRef, useState, useCallback, useEffect } from "react";
import { StemEngine } from "../audio/StemEngine";
import type { MetronomeState } from "../audio/StemEngine";

export interface AudioEngine {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  /** Live playback position (seconds) updated on every audio report — read this
   *  in a rAF loop to drive smooth UI (cursors) without triggering re-renders. */
  currentTimeRef: React.MutableRefObject<number>;
  duration: number;
  loadStems: (buffers: Record<string, AudioBuffer>) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setPitch: (semitones: number) => void;
  setTempo: (rate: number) => void;
  setStemVolume: (name: string, vol: number) => void;
  setStemMuted: (name: string, muted: boolean) => void;
  setStemSolo: (name: string, solo: boolean) => void;
  setLoopRegion: (start: number | null, end: number | null) => void;
  /** Configura el metrónomo sincronizado (enabled/bpm/compás/volumen/desfase). */
  setMetronome: (opts: Partial<MetronomeState>) => void;
}

/**
 * Adaptador React sobre StemEngine. Su única responsabilidad es traducir el
 * estado del motor de audio (que vive fuera de React, en el hilo de audio) a
 * estado de React para la UI, y reenviar las acciones de la UI al motor.
 *
 * Toda la lógica de DSP/transporte/loop está en StemEngine; aquí no hay nada
 * de soundtouch ni de pitch/tempo más allá de delegar.
 */
export function useAudioEngine(masterStem: string): AudioEngine {
  const [isReady, setIsReady]         = useState(false);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);

  const engineRef      = useRef<StemEngine | null>(null);
  const currentTimeRef = useRef(0);
  const lastFlushRef   = useRef(0);

  // Crear el motor una vez por stem maestro.
  useEffect(() => {
    const engine = new StemEngine(masterStem, {
      onPosition: (t) => {
        currentTimeRef.current = t;
        // Refrescar el estado de React como mucho ~8×/s; el cursor fino se
        // dibuja desde currentTimeRef en un rAF aparte (ver DAWView).
        const now = performance.now();
        if (now - lastFlushRef.current >= 120) {
          lastFlushRef.current = now;
          setCurrentTime(t);
        }
      },
      onEnded: () => {
        engineRef.current?.pause();
        engineRef.current?.seek(0);
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setIsPlaying(false);
      },
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.teardown();
    };
  }, [masterStem]);

  const loadStems = useCallback((buffers: Record<string, AudioBuffer>) => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsReady(false);
    setIsPlaying(false);
    currentTimeRef.current = 0;
    lastFlushRef.current = 0;
    setCurrentTime(0);
    engine
      .load(buffers)
      .then(() => {
        setDuration(engine.getDuration());
        setIsReady(true);
      })
      .catch((err) => console.error("[audio] fallo al cargar stems", err));
  }, []);

  const play = useCallback(() => {
    engineRef.current?.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setIsPlaying(false);
    setCurrentTime(currentTimeRef.current);
  }, []);

  const seek = useCallback((time: number) => {
    engineRef.current?.seek(time);
    currentTimeRef.current = time;
    setCurrentTime(time);
  }, []);

  const setPitch = useCallback((semitones: number) => {
    engineRef.current?.setPitch(semitones);
  }, []);

  const setTempo = useCallback((rate: number) => {
    engineRef.current?.setTempo(rate);
  }, []);

  const setStemVolume = useCallback((name: string, vol: number) => {
    engineRef.current?.setVolume(name, vol);
  }, []);

  const setStemMuted = useCallback((name: string, muted: boolean) => {
    engineRef.current?.setMuted(name, muted);
  }, []);

  const setStemSolo = useCallback((name: string, solo: boolean) => {
    engineRef.current?.setSolo(name, solo);
  }, []);

  const setLoopRegion = useCallback((start: number | null, end: number | null) => {
    engineRef.current?.setLoopRegion(start, end);
  }, []);

  const setMetronome = useCallback((opts: Partial<MetronomeState>) => {
    engineRef.current?.setMetronome(opts);
  }, []);

  return {
    isReady, isPlaying, currentTime, currentTimeRef, duration,
    loadStems, play, pause, seek,
    setPitch, setTempo, setStemVolume, setStemMuted, setStemSolo, setLoopRegion,
    setMetronome,
  };
}
