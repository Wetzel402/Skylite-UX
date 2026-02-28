import { consola } from "consola";

type HomeSSECallbacks = {
  onWeatherUpdate?: (data: any) => void;
  onMealsUpdate?: (data: any) => void;
  onTodosUpdate?: (data: any) => void;
  onEventsUpdate?: (data: any) => void;
  onCountdownsUpdate?: (data: any) => void;
};

export function useHomeSSE(callbacks: HomeSSECallbacks) {
  const homeUpdates = useState<Record<string, { data: any; timestamp: Date }>>("home-sse-updates", () => ({}));

  const eventMap: Record<string, keyof HomeSSECallbacks> = {
    weather_update: "onWeatherUpdate",
    meals_update: "onMealsUpdate",
    todos_update: "onTodosUpdate",
    events_update: "onEventsUpdate",
    countdowns_update: "onCountdownsUpdate",
  };

  // Track last processed timestamps to avoid duplicate processing
  const lastProcessed = ref<Record<string, number>>({});

  const stopWatch = watch(
    homeUpdates,
    (updates) => {
      for (const [eventType, callbackKey] of Object.entries(eventMap)) {
        const update = updates[eventType];
        if (update && callbacks[callbackKey]) {
          const updateTime = new Date(update.timestamp).getTime();
          if (updateTime !== lastProcessed.value[eventType]) {
            lastProcessed.value[eventType] = updateTime;
            consola.debug(`[Home SSE] Dispatching ${eventType}`);
            callbacks[callbackKey]!(update.data);
          }
        }
      }
    },
    { deep: true },
  );

  onUnmounted(() => {
    stopWatch();
  });

  return {
    homeUpdates: readonly(homeUpdates),
  };
}
