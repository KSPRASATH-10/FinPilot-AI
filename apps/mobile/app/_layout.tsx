import { Stack, Redirect, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../store/useAuthStore";

function useProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const segments = useSegments();
  const inAuth = segments[0] === "(auth)";
  if (!user && !inAuth) return "/(auth)/login" as const;
  if (user && inAuth) return "/(tabs)/home" as const;
  return null;
}

export default function RootLayout() {
  const redirect = useProtectedRoute();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
        </Stack>
        {redirect ? <Redirect href={redirect} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}