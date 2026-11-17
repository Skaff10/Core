import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { GLASS_MOTION } from './tokens';

/**
 * A value that runs from 0 to 1 over `duration`, then starts again, for the library's only loops:
 * progress, spinners and skeletons. It rests at 0 while `running` is false and stops on unmount.
 */
export function useLoop(duration: number, running: boolean) {
  // State, not a ref, holds the value: render reads it, and it never changes identity.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    progress.setValue(0);

    if (!running) return;

    const loop = Animated.loop(
      Animated.timing(progress, {
        duration,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: GLASS_MOTION.nativeDriver,
      }),
    );

    loop.start();

    return () => loop.stop();
  }, [duration, progress, running]);

  return progress;
}
