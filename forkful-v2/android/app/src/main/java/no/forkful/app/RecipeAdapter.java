package no.forkful.app;

import android.content.Context;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class RecipeAdapter extends RecyclerView.Adapter<RecipeAdapter.ViewHolder> {

    public interface OnItemClickListener {
        void onItemClick(Recipe recipe);
    }

    private List<Recipe> recipes;
    private OnItemClickListener listener;

    private static final String[] PLACEHOLDER_COLORS = {
        "#c4622d", "#8b4513", "#a0522d", "#d2691e", "#cd853f"
    };

    public RecipeAdapter(List<Recipe> recipes) {
        this.recipes = recipes;
    }

    public void setRecipes(List<Recipe> recipes) {
        this.recipes = recipes;
        notifyDataSetChanged();
    }

    public void setOnItemClickListener(OnItemClickListener listener) {
        this.listener = listener;
    }

    public void removeItem(String id) {
        for (int i = 0; i < recipes.size(); i++) {
            if (id.equals(recipes.get(i).id)) {
                recipes.remove(i);
                notifyItemRemoved(i);
                return;
            }
        }
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_recipe, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Recipe recipe = recipes.get(position);
        Context ctx = holder.itemView.getContext();

        holder.title.setText(recipe.title);
        holder.source.setText(recipe.source != null ? recipe.source : "");
        holder.time.setText(recipe.time != null && !recipe.time.isEmpty() ? "⏱ " + recipe.time : "");
        holder.servings.setText(recipe.servings != null && !recipe.servings.isEmpty() ? "👤 " + recipe.servings : "");
        holder.date.setText(formatDate(recipe.savedAt));

        // Tags
        holder.tagsContainer.removeAllViews();
        if (recipe.tags != null) {
            for (String tag : recipe.tags) {
                TextView chip = new TextView(ctx);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.setMargins(0, 0, 8, 0);
                chip.setLayoutParams(lp);
                chip.setText(tag);
                chip.setTextSize(10f);
                chip.setTextColor(Color.parseColor("#c4622d"));
                chip.setBackgroundResource(R.drawable.tag_background);
                chip.setPadding(dpToPx(ctx, 6), dpToPx(ctx, 2), dpToPx(ctx, 6), dpToPx(ctx, 2));
                holder.tagsContainer.addView(chip);
            }
        }

        // Image
        if (recipe.image != null && !recipe.image.isEmpty()) {
            Glide.with(ctx)
                    .load(recipe.image)
                    .centerCrop()
                    .placeholder(createColorDrawable(ctx, position))
                    .error(createColorDrawable(ctx, position))
                    .into(holder.image);
        } else {
            holder.image.setImageDrawable(null);
            holder.image.setBackgroundColor(Color.parseColor(PLACEHOLDER_COLORS[position % PLACEHOLDER_COLORS.length]));
        }

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onItemClick(recipe);
        });
    }

    private android.graphics.drawable.ColorDrawable createColorDrawable(Context ctx, int pos) {
        return new android.graphics.drawable.ColorDrawable(
                Color.parseColor(PLACEHOLDER_COLORS[pos % PLACEHOLDER_COLORS.length]));
    }

    private String formatDate(String isoDate) {
        if (isoDate == null || isoDate.isEmpty()) return "";
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault());
            Date d = sdf.parse(isoDate);
            return new SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()).format(d);
        } catch (ParseException e) {
            return "";
        }
    }

    private int dpToPx(Context ctx, int dp) {
        return (int) (dp * ctx.getResources().getDisplayMetrics().density);
    }

    @Override
    public int getItemCount() {
        return recipes != null ? recipes.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        ImageView image;
        TextView source, title, time, servings, date;
        LinearLayout tagsContainer;

        ViewHolder(View itemView) {
            super(itemView);
            image = itemView.findViewById(R.id.recipe_image);
            source = itemView.findViewById(R.id.recipe_source);
            title = itemView.findViewById(R.id.recipe_title);
            time = itemView.findViewById(R.id.recipe_time);
            servings = itemView.findViewById(R.id.recipe_servings);
            date = itemView.findViewById(R.id.recipe_date);
            tagsContainer = itemView.findViewById(R.id.tags_container);
        }
    }
}
