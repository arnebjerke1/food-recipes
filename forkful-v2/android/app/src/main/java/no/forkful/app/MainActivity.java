package no.forkful.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.android.material.floatingactionbutton.FloatingActionButton;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public class MainActivity extends AppCompatActivity {

    private RecyclerView recyclerView;
    private RecipeAdapter adapter;
    private FrameLayout emptyState;
    private List<Recipe> recipes;

    private static final int REQUEST_ADD = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Toolbar toolbar = findViewById(R.id.forkful_toolbar);
        setSupportActionBar(toolbar);

        recyclerView = findViewById(R.id.recipe_list);
        emptyState = findViewById(R.id.empty_state);

        GridLayoutManager layoutManager = new GridLayoutManager(this, 2);
        recyclerView.setLayoutManager(layoutManager);

        adapter = new RecipeAdapter(new ArrayList<>());
        adapter.setOnItemClickListener(recipe -> {
            Intent intent = new Intent(this, RecipeDetailActivity.class);
            intent.putExtra("recipe_id", recipe.id);
            startActivityForResult(intent, REQUEST_ADD);
        });
        recyclerView.setAdapter(adapter);

        FloatingActionButton fab = findViewById(R.id.fab_add);
        fab.setOnClickListener(v -> openAddRecipe());

        View btnAddFirst = findViewById(R.id.btn_add_first);
        btnAddFirst.setOnClickListener(v -> openAddRecipe());
    }

    @Override
    protected void onResume() {
        super.onResume();
        loadRecipes();
    }

    private void loadRecipes() {
        recipes = RecipeStorage.load(this);
        if (recipes.isEmpty()) {
            recipes = getSampleRecipes();
            RecipeStorage.save(this, recipes);
        }
        adapter.setRecipes(recipes);
        updateEmptyState();
    }

    private void updateEmptyState() {
        if (recipes == null || recipes.isEmpty()) {
            emptyState.setVisibility(View.VISIBLE);
            recyclerView.setVisibility(View.GONE);
        } else {
            emptyState.setVisibility(View.GONE);
            recyclerView.setVisibility(View.VISIBLE);
        }
    }

    private void openAddRecipe() {
        Intent intent = new Intent(this, AddRecipeActivity.class);
        startActivityForResult(intent, REQUEST_ADD);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_ADD) {
            loadRecipes();
        }
    }

    private List<Recipe> getSampleRecipes() {
        Recipe r = new Recipe();
        r.id = UUID.randomUUID().toString();
        r.title = "Klassisk Carbonara";
        r.source = "Forkful";
        r.sourceUrl = "";
        r.image = null;
        r.time = "20 min";
        r.servings = "4";
        r.tags = Arrays.asList("pasta", "italiensk", "rask");
        r.ingredients = Arrays.asList(
            new Ingredient("400", "g", "spaghetti"),
            new Ingredient("200", "g", "pancetta eller bacon"),
            new Ingredient("4", "stk", "egg"),
            new Ingredient("100", "g", "parmesan, revet"),
            new Ingredient("2", "fedd", "hvitløk")
        );
        r.steps = Arrays.asList(
            "Kok spaghetti i saltet vann til al dente.",
            "Stek pancetta og hvitløk i panne til sprøtt.",
            "Visp sammen egg og parmesan i en bolle.",
            "Bland varm pasta med pancetta, ta av varmen og rør inn eggeblandingen raskt.",
            "Server med ekstra parmesan og nykvernet pepper."
        );
        r.isVideoOnly = false;
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault());
        sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        r.savedAt = sdf.format(new Date());
        List<Recipe> list = new ArrayList<>();
        list.add(r);
        return list;
    }
}
