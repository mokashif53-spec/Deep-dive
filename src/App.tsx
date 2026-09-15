import { useEffect, useRef, useState, useCallback } from "react";
import { Game, Snapshot } from "./game/Game";
import { Audio } from "./game/AudioManager";
import { SaveManager } from "./game/SaveManager";
import { HUD } from "./components/HUD";
import { MenuScreen, PauseScreen, GameOverScreen } from "./components/Screens";
import { TutorialScreen } from "./components/TutorialScreen";

/**
 * App: hosts the canvas game and the React UI overlays.
 * The game engine publishes a Snapshot every frame; React only renders overlays.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [music, setMusic] = useState(Audio.isMusicOn);
  const [sound, setSound] = useState(Audio.isSoundOn);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas);
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game; // debug/testing handle
    const unsub = game.subscribe(setSnap);
    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvas);
    window.addEventListener("orientationchange", () => setTimeout(() => game.resize(), 200));
    return () => {
      unsub();
      ro.disconnect();
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const g = gameRef.current!;
    Audio.init();
    if (!SaveManager.isTutorialDone()) g.showTutorial();
    else g.startGame();
  }, []);

  const finishTutorial = useCallback(() => {
    SaveManager.setTutorialDone();
    gameRef.current!.startGame();
  }, []);

  const toggleMusic = () => {
    const v = !music;
    setMusic(v);
    Audio.setMusic(v);
  };
  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    Audio.setSound(v);
  };

  const state = snap?.state ?? "MENU";
  const inGame = state === "PLAYING" || state === "BOOSTING" || state === "DYING";

  return (
    <div className="fixed inset-0 bg-[#010a16] flex items-center justify-center overflow-hidden">
      {/* soft ambient glow behind the portrait stage on wide screens */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,80,130,0.35),transparent_70%)]" />
      <div className="game-stage relative overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.6)]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block touch-none" />

        {snap && (inGame || state === "PAUSED") && <HUD snap={snap} onPause={() => gameRef.current?.pause()} />}

        {state === "MENU" && <MenuScreen best={snap?.best ?? 0} onPlay={play} music={music} sound={sound} onToggleMusic={toggleMusic} onToggleSound={toggleSound} />}

        {state === "TUTORIAL" && <TutorialScreen onDone={finishTutorial} />}

        {state === "PAUSED" && (
          <PauseScreen
            onResume={() => gameRef.current?.resume()}
            onRestart={() => gameRef.current?.restart()}
            onHome={() => gameRef.current?.goHome()}
            music={music}
            sound={sound}
            onToggleMusic={toggleMusic}
            onToggleSound={toggleSound}
          />
        )}

        {state === "GAME_OVER" && snap && (
          <GameOverScreen score={snap.score} best={snap.best} depth={snap.depth} newBest={snap.newBest} onRetry={() => gameRef.current?.restart()} onHome={() => gameRef.current?.goHome()} />
        )}
      </div>
    </div>
  );
}
