import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../theme/useTheme";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  noPad?: boolean;
}

export function GlassCard({ children, style, noPad }: Props) {
  const T = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: T.card,
          borderColor: T.cardBorder,
          shadowColor: T.shadow,
        },
        !noPad && styles.pad,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  pad: { padding: 20 },
});
