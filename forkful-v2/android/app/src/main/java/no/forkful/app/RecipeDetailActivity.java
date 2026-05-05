package no.forkful.app;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.widget.NestedScrollView;
import com.bumptech.glide.Glide;
import java.util.List;

public class RecipeDetailActivity extends AppCompatActivity {

    private Recipe recipe;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_recipe_detail);

        Toolbar toolbar = findViewById(R.id.detail_toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }

        String recipeId = getIntent().getStringExtra("recipe_id");
        if (recipeId == null) { finish(); return; }

        List<Recipe> all = RecipeStorage.load(this);
        for (Recipe r : all) {
            if (recipeId.equals(r.id)) { recipe = r; break; }
        }
        if (recipe == null) { finish(); return; }

        if (getSupportActionBar() != null) getSupportActionBar().setTitle(recipe.title);

        bindViews();
    }

    private void bindViews() {
        ImageView heroImage = findViewById(R.id.detail_image);
        TextView sourceText = findViewById(R.id.detail_source);
        TextView titleText = findViewById(R.id.detail_title);
        TextView timeText = findViewById(R.id.detail_time);
        TextView servingsText = findViewById(R.id.detail_servings);
        LinearLayout tagsContainer = findViewById(R.id.detail_tags);
        LinearLayout ingredientsContainer = findViewById(R.id.ingredients_container);
        LinearLayout stepsContainer = findViewById(R.id.steps_container);
        Button deleteBtn = findViewById(R.id.btn_delete);

        // Image
        if (recipe.image != null && !recipe.image.isEmpty()) {
            Glide.with(this).load(recipe.image).centerCrop().into(heroImage);
        } else {
            heroImage.setBackgroundColor(0xFFC4622D);
        }

        sourceText.setText(recipe.source != null ? recipe.source : "");
        titleText.setText(recipe.title);
        timeText.setText(recipe.time != null && !recipe.time.isEmpty() ? "⏱ " + recipe.time : "");
        servingsText.setText(recipe.servings != null && !recipe.servings.isEmpty() ? "👤 " + recipe.servings : "");

        // Tags
        tagsContainer.removeAllViews();
        if (recipe.tags != null) {
            for (String tag : recipe.tags) {
                TextView chip = makeChip(tag);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.setMargins(0, 0, 8, 0);
                chip.setLayoutParams(lp);
                tagsContainer.addView(chip);
            }
        }

        // Ingredients
        ingredientsContainer.removeAllViews();
        if (recipe.ingredients != null) {
            for (Ingredient ing : recipe.ingredients) {
                TextView tv = new TextView(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.setMargins(0, 0, 0, dpToPx(8));
                tv.setLayoutParams(lp);
                String amtStr = ing.formatAmount();
                String text = amtStr.isEmpty() ? ing.name : amtStr + "  " + ing.name;
                tv.setText(text);
                tv.setTextSize(15f);
                tv.setTextColor(0xFF2C1810);
                ingredientsContainer.addView(tv);
            }
        }

        // Steps
        stepsContainer.removeAllViews();
        if (recipe.steps != null) {
            for (int i = 0; i < recipe.steps.size(); i++) {
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                rowLp.setMargins(0, 0, 0, dpToPx(12));
                row.setLayoutParams(rowLp);

                TextView num = new TextView(this);
                num.setText(String.valueOf(i + 1));
                num.setTextSize(14f);
                num.setTextColor(0xFFFFFFFF);
                num.setBackgroundColor(0xFFC4622D);
                int sz = dpToPx(28);
                LinearLayout.LayoutParams numLp = new LinearLayout.LayoutParams(sz, sz);
                numLp.setMargins(0, 0, dpToPx(12), 0);
                num.setLayoutParams(numLp);
                num.setGravity(android.view.Gravity.CENTER);
                num.setMinWidth(sz);
                num.setPadding(0, 0, 0, 0);

                TextView stepText = new TextView(this);
                stepText.setText(recipe.steps.get(i));
                stepText.setTextSize(15f);
                stepText.setTextColor(0xFF2C1810);
                LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(
                        0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
                stepText.setLayoutParams(textLp);

                row.addView(num);
                row.addView(stepText);
                stepsContainer.addView(row);
            }
        }

        // Delete button
        deleteBtn.setOnClickListener(v -> showDeleteConfirm());
    }

    private void showDeleteConfirm() {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.delete_confirm_title))
                .setMessage(getString(R.string.delete_confirm_message))
                .setPositiveButton(getString(R.string.delete), (dialog, which) -> {
                    List<Recipe> all = RecipeStorage.load(this);
                    all.removeIf(r -> r.id.equals(recipe.id));
                    RecipeStorage.save(this, all);
                    setResult(RESULT_OK);
                    finish();
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private TextView makeChip(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(11f);
        tv.setTextColor(0xFFC4622D);
        tv.setBackgroundResource(R.drawable.tag_background);
        tv.setPadding(dpToPx(8), dpToPx(3), dpToPx(8), dpToPx(3));
        return tv;
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
