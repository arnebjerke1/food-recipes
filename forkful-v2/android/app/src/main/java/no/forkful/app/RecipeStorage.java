package no.forkful.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

public class RecipeStorage {
    private static final String PREFS_NAME = "forkful_prefs";
    private static final String KEY_RECIPES = "forkful_recipes";
    private static final Gson gson = new Gson();

    public static void save(Context context, List<Recipe> recipes) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = gson.toJson(recipes);
        prefs.edit().putString(KEY_RECIPES, json).apply();
    }

    public static List<Recipe> load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_RECIPES, null);
        if (json == null) return new ArrayList<>();
        try {
            Type type = new TypeToken<List<Recipe>>() {}.getType();
            List<Recipe> list = gson.fromJson(json, type);
            return list != null ? list : new ArrayList<>();
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}
