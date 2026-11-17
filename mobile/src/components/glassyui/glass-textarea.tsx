import { ComponentRef, forwardRef, useCallback, useState } from 'react';
import { StyleSheet, type TextInput, type TextInputContentSizeChangeEvent } from 'react-native';
import { GlassInput, type GlassInputProps } from './glass-input';

export type GlassTextareaProps = GlassInputProps & {
  /** Grows with its text instead of scrolling, up to `maxRows`. */
  autoResize?: boolean;
  /** The most rows an auto-resizing textarea grows to. Defaults to 8. */
  maxRows?: number;
  /** The rows it shows before it grows. Defaults to 3. */
  rows?: number;
};

const LINE_HEIGHT = 24;

const BORDER = 1;

// The field's padding and hairline above and below its lines.
const FRAME = 14 * 2 + BORDER * 2;

// The web's 5.5rem floor, which holds even when `rows` asks for less.
const MIN_HEIGHT = 88;

/**
 * A recessed field for longer text, with an optional label and hint. With `autoResize` it grows
 * as you type and scrolls once it reaches `maxRows`.
 */
export const GlassTextarea = forwardRef<ComponentRef<typeof TextInput>, GlassTextareaProps>(
  ({ autoResize = false, maxRows = 8, onContentSizeChange, rows = 3, style, ...rest }, ref) => {
    const [content, setContent] = useState(0);
    const least = Math.max(rows * LINE_HEIGHT + FRAME, MIN_HEIGHT);
    const most = Math.max(maxRows * LINE_HEIGHT + FRAME, least);

    // The reported size includes the padding but not the hairline.
    const height = autoResize ? Math.min(Math.max(content + BORDER * 2, least), most) : least;

    const handleContentSizeChange = useCallback(
      (event: TextInputContentSizeChangeEvent) => {
        setContent(event.nativeEvent.contentSize.height);
        onContentSizeChange?.(event);
      },
      [onContentSizeChange],
    );

    return (
      <GlassInput
        ref={ref}
        multiline
        onContentSizeChange={handleContentSizeChange}
        style={[styles.textarea, { height }, style]}
        {...rest}
      />
    );
  },
);

GlassTextarea.displayName = 'GlassTextarea';

const styles = StyleSheet.create({
  textarea: { lineHeight: LINE_HEIGHT, textAlignVertical: 'top' },
});
