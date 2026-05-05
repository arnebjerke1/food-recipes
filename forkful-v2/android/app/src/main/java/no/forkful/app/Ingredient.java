package no.forkful.app;

public class Ingredient {
    public String amount;
    public String unit;
    public String name;

    public Ingredient() {}

    public Ingredient(String amount, String unit, String name) {
        this.amount = amount;
        this.unit = unit;
        this.name = name;
    }

    public String formatAmount() {
        if (amount == null || amount.isEmpty()) return "";
        return unit != null && !unit.isEmpty() ? amount + " " + unit : amount;
    }
}
