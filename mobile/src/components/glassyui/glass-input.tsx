import { ComponentRef, forwardRef, useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type BlurEvent,
  type FocusEvent,
  type TextInputProps,
} from 'react-native';
import { useGlassTheme } from './glass-provider';
import { GLASS_RADIUS } from './lib/tokens';

export type GlassInputProps = TextInputProps & {
  /** A line of muted text under the field. With `invalid` it turns the invalid colour. */
  hint?: string;
  /** Marks the value as wrong: the field's ring and its hint turn the invalid colour. */
  invalid?: boolean;
  /** Text above the field. It also names the field for screen readers. */
  label?: string;
};

// The recessed well a field sits in, from --lg-input-shadow.
const WELL_SHADOW = {
  dark: 'inset 0px 1px 2px rgba(0, 0, 0, 0.24), inset 0px -1px 0px rgba(255, 255, 255, 0.06)',
  light: 'inset 0px 1px 2px rgba(0, 0, 0, 0.08), inset 0px -1px 0px rgba(255, 255, 255, 0.8)',
} as const;

// A focused field lightens, as --lg-control-surface-hover does.
const FOCUSED_FILL = {
  dark: 'rgba(245, 245, 247, 0.14)',
  light: 'rgba(255, 255, 255, 0.95)',
} as const;

// The theme's muted ink at the web's 72%, so a placeholder reads as a placeholder.
const PLACEHOLDER = {
  dark: 'rgba(209, 209, 214, 0.72)',
  light: 'rgba(80, 80, 85, 0.72)',
} as const;

/**
 * A recessed text field with an optional label above and hint below. It fills in while focused,
 * without a ring, and rings in the invalid colour while `invalid`; `editable={false}` dims it.
 */
export const GlassInput = forwardRef<ComponentRef<typeof TextInput>, GlassInputProps>(
  ({ editable = true, hint, invalid = false, label, onBlur, onFocus, style, ...rest }, ref) => {
    const { colors, preferences } = useGlassTheme();
    const [focused, setFocused] = useState(false);
    const theme = preferences.theme;
    const ring = invalid ? colors.invalid : null;

    const handleFocus = useCallback(
      (event: FocusEvent) => {
        setFocused(true);
        onFocus?.(event);
      },
      [onFocus],
    );

    const handleBlur = useCallback(
      (event: BlurEvent) => {
        setFocused(false);
        onBlur?.(event);
      },
      [onBlur],
    );

    // The field carries the label and hint for screen readers, so the visible text is hidden
    // from them rather than read twice.
    return (
      <View style={styles.field}>
        {label ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.label, { color: colors.mutedForeground }]}
          >
            {label}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityHint={hint}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholderTextColor={PLACEHOLDER[theme]}
          underlineColorAndroid="transparent"
          style={[
            styles.input,
            {
              backgroundColor: focused ? FOCUSED_FILL[theme] : colors.controlSurface,
              borderColor: ring ?? colors.border,
              boxShadow: ring ? `0px 0px 0px 1px ${ring}` : WELL_SHADOW[theme],
              color: colors.foreground,
            },
            !editable && styles.disabled,
            style,
          ]}
          {...rest}
        />
        {hint ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.hint, { color: invalid ? colors.invalid : colors.mutedForeground }]}
          >
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

GlassInput.displayName = 'GlassInput';

const styles = StyleSheet.create({
  disabled: { opacity: 0.45 },
  field: { alignSelf: 'stretch', gap: 8 },
  hint: { fontSize: 12, lineHeight: 16 },
  input: {
    borderCurve: 'continuous',
    borderRadius: GLASS_RADIUS.md,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  label: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
});
