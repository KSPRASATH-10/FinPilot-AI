import { Tabs } from "expo-router";
import { Text, StyleSheet, View } from "react-native";
import { DARK as T } from "../../theme";

// Using simple, clear text-based icons instead of low-contrast emoji symbols
const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Home:      { active: "🏠", inactive: "🏠" },
  Analytics: { active: "📊", inactive: "📊" },
  FinPilot:  { active: "✦",  inactive: "✦"  },
  Calendar:  { active: "📅", inactive: "📅" },
  Profile:   { active: "👤", inactive: "👤" },
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons = TAB_ICONS[label] ?? { active: "●", inactive: "●" };
  return (
    <View style={[tbS.wrap, focused && { backgroundColor: `${T.accent}28` }]}>
      <Text style={[tbS.icon, { opacity: focused ? 1 : 0.6 }]}>
        {focused ? icons.active : icons.inactive}
      </Text>
      {focused && <View style={[tbS.dot, { backgroundColor: T.accent }]} />}
    </View>
  );
}

const tbS = StyleSheet.create({
  wrap: {
    width: 44, height: 36, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  icon: { fontSize: 22 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});

const TABS = [
  { name: "home/index",      title: "Home"      },
  { name: "analytics/index", title: "Analytics" },
  { name: "assistant/index", title: "FinPilot"  },
  { name: "calendar/index",  title: "Calendar"  },
  { name: "profile/index",   title: "Profile"   },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => {
        const tab = TABS.find((t) => t.name === route.name);
        const label = tab?.title ?? route.name;
        return {
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: "rgba(240,244,255,0.55)",
          tabBarStyle: {
            backgroundColor: "#0D1221",
            borderTopColor: "rgba(255,255,255,0.12)",
            borderTopWidth: 1,
            height: 68,
            paddingBottom: 10,
            paddingTop: 6,
          },
          tabBarIcon: ({ focused }) => <TabIcon label={label} focused={focused} />,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.2,
          },
          title: label,
        };
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
      <Tabs.Screen name="reports/index"  options={{ href: null }} />
      <Tabs.Screen name="scan/index"     options={{ href: null }} />
      <Tabs.Screen name="settings/index" options={{ href: null }} />
    </Tabs>
  );
}