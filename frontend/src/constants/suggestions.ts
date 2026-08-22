export const INGREDIENT_SUGGESTIONS = [
  // Proteins
  'bacon', 'beef steak', 'chicken breast', 'chicken thighs', 'chicken wings',
  'crab', 'eggs', 'ground beef', 'ground pork', 'ground turkey', 'ham',
  'lamb chops', 'lobster', 'pork chops', 'pork loin', 'salmon', 'sausage',
  'shrimp', 'tempeh', 'tilapia', 'tofu', 'tuna', 'turkey breast',
  // Dairy
  'butter', 'cheddar cheese', 'cottage cheese', 'cream cheese', 'feta cheese',
  'goat cheese', 'greek yogurt', 'gruyere cheese', 'half and half', 'heavy cream',
  'milk', 'mozzarella cheese', 'parmesan cheese', 'ricotta cheese', 'sour cream',
  'whole milk', 'yogurt',
  // Vegetables
  'artichoke', 'arugula', 'asparagus', 'avocado', 'beet', 'bell pepper',
  'broccoli', 'brussels sprouts', 'butternut squash', 'cabbage', 'carrot',
  'cauliflower', 'celery', 'cherry tomato', 'chili pepper', 'corn', 'cucumber',
  'eggplant', 'fennel', 'garlic', 'green bean', 'green bell pepper', 'green onion',
  'iceberg lettuce', 'jalapeño', 'kale', 'leek', 'mushroom', 'onion', 'pea',
  'portobello mushroom', 'potato', 'radish', 'red bell pepper', 'red onion',
  'romaine lettuce', 'shallot', 'shiitake mushroom', 'spinach', 'squash',
  'sweet potato', 'tomato', 'yellow onion', 'zucchini',
  // Fruits
  'apple', 'banana', 'blackberry', 'blueberry', 'cantaloupe', 'grape',
  'lemon', 'lime', 'mango', 'orange', 'peach', 'pear', 'pineapple',
  'pomegranate', 'raspberry', 'strawberry', 'watermelon',
  // Grains & Starches
  'all-purpose flour', 'barley', 'basmati rice', 'bread flour', 'breadcrumb',
  'brown rice', 'cornmeal', 'cornstarch', 'egg noodle', 'farro', 'fettuccine',
  'flour', 'jasmine rice', 'lasagna noodle', 'oats', 'panko breadcrumb', 'pasta',
  'penne', 'polenta', 'potato starch', 'quinoa', 'rice', 'rolled oat',
  'sourdough bread', 'spaghetti', 'white rice', 'whole wheat flour',
  // Legumes
  'black bean', 'cannellini bean', 'chickpea', 'edamame', 'kidney bean',
  'lentil', 'pinto bean', 'split pea', 'white bean',
  // Canned & Broths
  'beef broth', 'beef stock', 'chicken broth', 'chicken stock', 'coconut cream',
  'coconut milk', 'crushed tomato', 'diced tomato', 'tomato paste',
  'tomato sauce', 'vegetable broth', 'vegetable stock',
  // Oils & Vinegars
  'apple cider vinegar', 'balsamic vinegar', 'canola oil', 'coconut oil',
  'extra virgin olive oil', 'ghee', 'olive oil', 'red wine vinegar', 'rice vinegar',
  'sesame oil', 'vegetable oil', 'white vinegar',
  // Sauces & Condiments
  'agave', 'dijon mustard', 'fish sauce', 'hoisin sauce', 'honey', 'hot sauce',
  'ketchup', 'maple syrup', 'mayonnaise', 'miso paste', 'mustard', 'oyster sauce',
  'soy sauce', 'sriracha', 'tahini', 'tamari', 'Worcestershire sauce',
  // Spices & Herbs
  'allspice', 'basil', 'bay leaf', 'black pepper', 'cardamom', 'cayenne pepper',
  'chili powder', 'chive', 'cilantro', 'cinnamon', 'clove', 'coriander',
  'cumin', 'curry powder', 'dill', 'fresh ginger', 'garam masala', 'garlic powder',
  'ginger', 'ground cinnamon', 'ground coriander', 'ground cumin', 'ground ginger',
  'italian seasoning', 'kosher salt', 'marjoram', 'mint', 'nutmeg', 'onion powder',
  'oregano', 'paprika', 'parsley', 'red pepper flake', 'rosemary', 'sage',
  'salt', 'sea salt', 'smoked paprika', 'tarragon', 'thyme', 'turmeric',
  'white pepper',
  // Baking
  'active dry yeast', 'almond extract', 'baking powder', 'baking soda',
  'brown sugar', 'caster sugar', 'chocolate chip', 'cocoa powder',
  'cream of tartar', 'dark chocolate', 'gelatin', 'powdered sugar',
  'semi-sweet chocolate', 'sugar', 'vanilla bean', 'vanilla extract', 'yeast',
  // Nuts & Seeds
  'almond butter', 'almond', 'cashew', 'chia seed', 'flaxseed', 'hazelnut',
  'peanut butter', 'peanut', 'pecan', 'pine nut', 'pumpkin seed',
  'sesame seed', 'sunflower seed', 'walnut',
  // Other
  'beer', 'lemon juice', 'lime juice', 'orange juice', 'red wine',
  'water', 'white wine',
].sort();

// Canonical units first (these match backend normalization in constants/units.ts), then a few
// common free-text descriptors that have no canonical abbreviation. Free text is always allowed.
export const UNIT_SUGGESTIONS = [
  // Volume (canonical)
  'tsp', 'tbsp', 'cup', 'fl oz', 'pt', 'qt', 'gal', 'ml', 'l',
  // Weight (canonical)
  'g', 'kg', 'oz', 'lb',
  // Count / descriptive (canonical)
  'pinch', 'dash', 'clove', 'can', 'slice', 'stick', 'bunch', 'sprig', 'head', 'piece',
  // Non-canonical free-text descriptors (pass-through)
  'bag', 'drop', 'handful', 'inch', 'jar', 'large', 'loaf', 'medium',
  'package', 'sheet', 'small', 'stalk', 'whole',
];
