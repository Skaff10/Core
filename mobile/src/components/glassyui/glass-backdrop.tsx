import { BlurTargetView } from 'expo-blur';
import { ComponentRef,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

type BackdropTarget = {
  /** The view Android blurs, once it has mounted. */
  target: RefObject<ComponentRef<typeof View> | null> | null;
};

const BackdropContext = createContext<BackdropTarget | null>(null);

/** The nearest GlassBackdrop, or null when glass sits outside one. */
export function useGlassBackdrop() {
  return useContext(BackdropContext);
}

export type GlassBackdropProps = ViewProps & {
  /** What the glass sits over: a wallpaper, a photo or the screen's own content. */
  backdrop: ReactNode;
};

/**
 * Lays its children over `backdrop`. iOS and the web blur whatever lies behind glass; Android can
 * only blur a view marked for it, so glass in the children blurs this backdrop there. Glass
 * outside any GlassBackdrop shows on Android as a translucent tint without blur.
 */
export function GlassBackdrop({ backdrop, children, ...rest }: GlassBackdropProps) {
  const targetRef = useRef<ComponentRef<typeof View> | null>(null);
  const [target, setTarget] = useState<RefObject<ComponentRef<typeof View> | null> | null>(null);

  // Android's blur reads its target when it mounts or when the target object changes, so the
  // glass gets a fresh object once the backdrop exists.
  useEffect(() => {
    setTarget({ current: targetRef.current });
  }, []);

  const value = useMemo(() => ({ target }), [target]);

  return (
    <View {...rest}>
      <BlurTargetView ref={targetRef} style={StyleSheet.absoluteFill}>
        {backdrop}
      </BlurTargetView>
      <BackdropContext.Provider value={value}>{children}</BackdropContext.Provider>
    </View>
  );
}
