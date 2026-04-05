package com.skylite.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SkyliteWidget2x2 : AppWidgetProvider() {
    companion object {
        private const val TAG = "SkyliteWidget2x2"
        private const val ACTION_OPEN_MEAL_PLANNER = "com.skylite.app.OPEN_MEAL_PLANNER"
        private const val MAX_MEALS_DISPLAY = 3

        fun updateWidget(context: Context, appWidgetId: Int, appWidgetManager: AppWidgetManager) {
            CoroutineScope(Dispatchers.Main).launch {
                val views = RemoteViews(context.packageName, R.layout.widget_2x2)

                val data = WidgetDataFetcher.fetchWidgetData(context)

                if (data.error != null && data.todayMeals.isEmpty()) {
                    views.setTextViewText(R.id.tvError, data.error)
                    views.setViewVisibility(R.id.tvError, View.VISIBLE)
                    views.setViewVisibility(R.id.layoutTodayMeals, View.GONE)
                    views.setViewVisibility(R.id.tvEmpty, View.GONE)
                } else {
                    views.setViewVisibility(R.id.tvError, View.GONE)

                    if (data.todayMeals.isEmpty()) {
                        views.setViewVisibility(R.id.layoutTodayMeals, View.GONE)
                        views.setViewVisibility(R.id.tvEmpty, View.VISIBLE)
                    } else {
                        views.setViewVisibility(R.id.layoutTodayMeals, View.VISIBLE)
                        views.setViewVisibility(R.id.tvEmpty, View.GONE)
                        populateMealSection(views, R.id.layoutTodayMeals, data.todayMeals, context)
                    }
                }

                val intent = Intent(context, MainActivity::class.java).apply {
                    action = ACTION_OPEN_MEAL_PLANNER
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("route", "/mealPlanner")
                }

                val pendingIntent = PendingIntent.getActivity(
                    context,
                    appWidgetId,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )

                views.setOnClickPendingIntent(R.id.layoutTodayMeals, pendingIntent)

                appWidgetManager.updateAppWidget(appWidgetId, views)
            }
        }

        private fun populateMealSection(
            views: RemoteViews,
            containerId: Int,
            meals: List<MealInfo>,
            context: Context
        ) {
            views.removeAllViews(containerId)

            val mealsToShow = meals.take(MAX_MEALS_DISPLAY)

            for (meal in mealsToShow) {
                views.addView(
                    containerId,
                    RemoteViews(context.packageName, android.R.layout.simple_list_item_1).apply {
                        setTextViewText(android.R.id.text1, "${meal.mealTypeLabel}: ${meal.name}")
                        setTextViewTextSize(android.R.id.text1, TypedValue.COMPLEX_UNIT_SP, 11f)
                        setTextColor(android.R.id.text1, context.getColor(R.color.widget_text_primary))
                    }
                )
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetId, appWidgetManager)
        }
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Log.d(TAG, "Widget 2x2 enabled")
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        Log.d(TAG, "Widget 2x2 disabled")
    }
}
