package no.forkful.app;

import java.util.List;

public class Recipe {
    public String id;
    public String title;
    public String source;
    public String sourceUrl;
    public String image;
    public String time;
    public String servings;
    public List<String> tags;
    public List<Ingredient> ingredients;
    public List<String> steps;
    public boolean isVideoOnly;
    public String savedAt;
}
