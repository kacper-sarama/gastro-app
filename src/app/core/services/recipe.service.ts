import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where,
  onSnapshot,
  setDoc,
  Unsubscribe 
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { 
  Recipe, 
  RecipeCapacityResult, 
  RecipeFormData,
  calculateRecipeCapacity 
} from '../models/recipe.model';
import { Subscription } from 'rxjs';

const LOCAL_STORAGE_KEY = 'gastro_recipes_fallback';
const CATEGORIES_STORAGE_KEY = 'gastro_recipe_categories_fallback';

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);

  readonly recipes = signal<Recipe[]>([]);
  readonly customCategories = signal<string[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private firestoreUnsub: Unsubscribe | null = null;
  private categoriesUnsub: Unsubscribe | null = null;

  // Wszystkie unikalne kategorie dań (z przepisów oraz zdefiniowane ręcznie)
  readonly allCategories = computed<string[]>(() => {
    const set = new Set<string>();
    for (const r of this.recipes()) {
      if (r.category && r.category.trim()) {
        set.add(r.category.trim());
      }
    }
    for (const c of this.customCategories()) {
      if (c && c.trim()) {
        set.add(c.trim());
      }
    }
    // Domyślne jeśli brak
    if (set.size === 0) {
      set.add('Pizza');
      set.add('Przystawki');
      set.add('Makarony');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  });

  // Liczba dań w danej kategorii
  getCategoryDishCount(categoryName: string): number {
    const target = categoryName.trim().toLowerCase();
    return this.recipes().filter(r => (r.category || '').trim().toLowerCase() === target).length;
  }

  // Mapa wyliczonej wydajności per ID receptury (reaktywna na zmiany magazynu i receptur)
  readonly capacitiesMap = computed<Map<string, RecipeCapacityResult>>(() => {
    const recipesList = this.recipes();
    const inventoryList = this.inventoryService.items();
    const map = new Map<string, RecipeCapacityResult>();

    for (const recipe of recipesList) {
      map.set(recipe.id, calculateRecipeCapacity(recipe, inventoryList));
    }

    return map;
  });

  // Metryki wydajności kuchni
  readonly totalRecipesCount = computed(() => this.recipes().length);

  readonly availableRecipesCount = computed(() => {
    const capacities = this.capacitiesMap();
    return Array.from(capacities.values()).filter(c => c.status === 'available').length;
  });

  readonly lowPortionRecipesCount = computed(() => {
    const capacities = this.capacitiesMap();
    return Array.from(capacities.values()).filter(c => c.status === 'low').length;
  });

  readonly blockedRecipesCount = computed(() => {
    const capacities = this.capacitiesMap();
    return Array.from(capacities.values()).filter(c => c.status === 'blocked').length;
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initFirestoreSubscription(user.uid);
      } else {
        this.loadLocalFallback();
      }
    });
  }

  getCapacity(recipeId: string): RecipeCapacityResult {
    return this.capacitiesMap().get(recipeId) || {
      maxPortions: 0,
      status: 'blocked',
      ingredientDetails: []
    };
  }

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    if (this.categoriesUnsub) {
      this.categoriesUnsub();
      this.categoriesUnsub = null;
    }

    try {
      // 1. Subskrypcja kategorii z ustawień lokalu
      const catDocRef = doc(this.firestore, `restaurant_settings/${restaurantId}`);
      this.categoriesUnsub = onSnapshot(catDocRef, (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.['recipeCategories'])) {
          this.customCategories.set(snap.data()?.['recipeCategories']);
        }
      }, () => {
        // Fallback jeśli brak dokumentu ustawień
      });

      // 2. Subskrypcja receptur
      const recipesCol = collection(this.firestore, 'recipes');
      const q = query(recipesCol, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Recipe));

        if (items.length === 0) {
          this.seedStarterRecipes(restaurantId);
        } else {
          this.recipes.set(items);
          this.isLoading.set(false);
        }
      }, (err) => {
        console.warn('Firestore recipes fallback to local storage:', err);
        this.loadLocalFallback();
        this.isLoading.set(false);
      });
    } catch (err) {
      console.warn('Firestore recipes initialization error:', err);
      this.loadLocalFallback();
      this.isLoading.set(false);
    }
  }

  private async seedStarterRecipes(restaurantId: string): Promise<void> {
    const inventory = this.inventoryService.items();
    const findId = (namePart: string) => inventory.find(i => i.name.toLowerCase().includes(namePart.toLowerCase()))?.id;

    const flourId = findId('mąka');
    const cheeseId = findId('mozzarella');
    const sauceId = findId('sos pomidorowy');
    const mushroomsId = findId('pieczarki');
    const yeastId = findId('drożdże');
    const oilId = findId('oliwa');
    const basilId = findId('bazylia');

    const starterRecipes: Omit<Recipe, 'id'>[] = [
      {
        restaurantId,
        name: 'Pizza Margherita 32cm',
        category: 'Pizza',
        description: 'Klasyczna włoska pizza z sosem San Marzano, mozzarellą i świeżą bazylią.',
        sellingPrice: 36,
        ingredients: [
          ...(flourId ? [{ inventoryItemId: flourId, amount: 220 }] : []),
          ...(sauceId ? [{ inventoryItemId: sauceId, amount: 90 }] : []),
          ...(cheeseId ? [{ inventoryItemId: cheeseId, amount: 130 }] : []),
          ...(oilId ? [{ inventoryItemId: oilId, amount: 10 }] : []),
          ...(yeastId ? [{ inventoryItemId: yeastId, amount: 3 }] : []),
          ...(basilId ? [{ inventoryItemId: basilId, amount: 1 }] : [])
        ],
        updatedAt: new Date().toISOString()
      },
      {
        restaurantId,
        name: 'Pizza Funghi 32cm',
        category: 'Pizza',
        description: 'Chrupiąca pizza z sosem pomidorowym, mozzarellą oraz świeżymi pieczarkami.',
        sellingPrice: 41,
        ingredients: [
          ...(flourId ? [{ inventoryItemId: flourId, amount: 220 }] : []),
          ...(sauceId ? [{ inventoryItemId: sauceId, amount: 90 }] : []),
          ...(cheeseId ? [{ inventoryItemId: cheeseId, amount: 130 }] : []),
          ...(mushroomsId ? [{ inventoryItemId: mushroomsId, amount: 80 }] : []),
          ...(oilId ? [{ inventoryItemId: oilId, amount: 10 }] : []),
          ...(yeastId ? [{ inventoryItemId: yeastId, amount: 3 }] : [])
        ],
        updatedAt: new Date().toISOString()
      },
      {
        restaurantId,
        name: 'Focaccia z Oliwią i Rozmarynem',
        category: 'Przystawki',
        description: 'Włoskie pieczywo drożdżowe z oliwą z oliwek extra virgin i solą morską.',
        sellingPrice: 22,
        ingredients: [
          ...(flourId ? [{ inventoryItemId: flourId, amount: 200 }] : []),
          ...(oilId ? [{ inventoryItemId: oilId, amount: 25 }] : []),
          ...(yeastId ? [{ inventoryItemId: yeastId, amount: 4 }] : [])
        ],
        updatedAt: new Date().toISOString()
      }
    ];

    try {
      const col = collection(this.firestore, 'recipes');
      for (const r of starterRecipes) {
        await addDoc(col, r);
      }
    } catch {
      this.loadLocalFallback();
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadLocalFallback(): void {
    const rawCats = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (rawCats) {
      try {
        this.customCategories.set(JSON.parse(rawCats));
      } catch {}
    }

    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        this.recipes.set(JSON.parse(raw));
        return;
      } catch {}
    }

    const inventory = this.inventoryService.items();
    const findId = (namePart: string) => inventory.find(i => i.name.toLowerCase().includes(namePart.toLowerCase()))?.id || 'demo-ing';

    const demoRecipes: Recipe[] = [
      {
        id: 'recipe-margherita',
        restaurantId: 'demo-restaurant',
        name: 'Pizza Margherita 32cm',
        category: 'Pizza',
        description: 'Klasyczna włoska pizza z sosem San Marzano, mozzarellą i świeżą bazylią.',
        sellingPrice: 36,
        ingredients: [
          { inventoryItemId: findId('mąka'), amount: 220 },
          { inventoryItemId: findId('sos pomidorowy'), amount: 90 },
          { inventoryItemId: findId('mozzarella'), amount: 130 },
          { inventoryItemId: findId('oliwa'), amount: 10 },
          { inventoryItemId: findId('drożdże'), amount: 3 },
          { inventoryItemId: findId('bazylia'), amount: 1 }
        ],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'recipe-funghi',
        restaurantId: 'demo-restaurant',
        name: 'Pizza Funghi 32cm',
        category: 'Pizza',
        description: 'Chrupiąca pizza z sosem pomidorowym, mozzarellą oraz świeżymi pieczarkami.',
        sellingPrice: 41,
        ingredients: [
          { inventoryItemId: findId('mąka'), amount: 220 },
          { inventoryItemId: findId('sos pomidorowy'), amount: 90 },
          { inventoryItemId: findId('mozzarella'), amount: 130 },
          { inventoryItemId: findId('pieczarki'), amount: 80 },
          { inventoryItemId: findId('oliwa'), amount: 10 },
          { inventoryItemId: findId('drożdże'), amount: 3 }
        ],
        updatedAt: new Date().toISOString()
      },
      {
        id: 'recipe-focaccia',
        restaurantId: 'demo-restaurant',
        name: 'Focaccia z Oliwą i Ziołami',
        category: 'Przystawki',
        description: 'Włoskie pieczywo drożdżowe z oliwą z oliwek extra virgin.',
        sellingPrice: 22,
        ingredients: [
          { inventoryItemId: findId('mąka'), amount: 200 },
          { inventoryItemId: findId('oliwa'), amount: 25 },
          { inventoryItemId: findId('drożdże'), amount: 4 }
        ],
        updatedAt: new Date().toISOString()
      }
    ];

    this.recipes.set(demoRecipes);
    this.saveToLocalFallback(demoRecipes);
  }

  private saveToLocalFallback(recipes: Recipe[]): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(recipes));
  }

  /**
   * Usuwa pola undefined (Firestore ich nie akceptuje)
   */
  private cleanObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        result[key] = val;
      }
    }
    return result;
  }

  // --- Operacje lokalne (tryb demo / offline) ---

  private addLocalRecipe(recipe: Recipe): void {
    const updated = [recipe, ...this.recipes()];
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }

  private updateLocalRecipe(id: string, fields: Partial<Recipe>): void {
    const updated = this.recipes().map(r => r.id === id ? { ...r, ...fields } : r);
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }

  private deleteLocalRecipe(id: string): void {
    const updated = this.recipes().filter(r => r.id !== id);
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }

  // --- Główne metody CRUD ---

  async addRecipe(data: RecipeFormData): Promise<void> {
    const user = this.authService.currentUser();
    const recipeData = this.cleanObject({
      ...data,
      restaurantId: user ? user.uid : 'demo-restaurant',
      updatedAt: new Date().toISOString()
    });

    if (user) {
      try {
        await addDoc(collection(this.firestore, 'recipes'), recipeData);
        return;
      } catch (err) {
        console.warn('Błąd zapisu receptury do Firestore, używam trybu lokalnego:', err);
      }
    }

    this.addLocalRecipe({ ...recipeData, id: `recipe-local-${Date.now()}` } as Recipe);
  }

  async updateRecipe(id: string, partial: Partial<Recipe>): Promise<void> {
    const user = this.authService.currentUser();
    const fields = this.cleanObject({
      ...partial,
      updatedAt: new Date().toISOString()
    });

    if (user && !id.startsWith('recipe-local-')) {
      try {
        await updateDoc(doc(this.firestore, `recipes/${id}`), fields);
        return;
      } catch (err) {
        console.warn('Błąd aktualizacji receptury w Firestore:', err);
      }
    }

    this.updateLocalRecipe(id, fields);
  }

  async deleteRecipe(id: string): Promise<void> {
    const user = this.authService.currentUser();

    if (user && !id.startsWith('recipe-local-')) {
      try {
        await deleteDoc(doc(this.firestore, `recipes/${id}`));
        return;
      } catch (err) {
        console.warn('Błąd usuwania receptury z Firestore:', err);
      }
    }

    this.deleteLocalRecipe(id);
  }

  /**
   * Włącza lub wyłącza dostępność dania w karcie menu
   */
  async toggleAvailability(id: string, isAvailable: boolean): Promise<void> {
    await this.updateRecipe(id, { isAvailable });
  }

  /**
   * Włącza lub wyłącza wyróżnienie pozycji w karcie (szef poleca)
   */
  async toggleFeatured(id: string, isFeatured: boolean): Promise<void> {
    await this.updateRecipe(id, { isFeatured });
  }

  // --- ZARZĄDZANIE KATEGORIAMI DAŃ ---

  private saveCategoriesToStorage(categories: string[]): void {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  }

  private async syncCategoriesToFirestore(categories: string[]): Promise<void> {
    const user = this.authService.currentUser();
    if (user) {
      try {
        const catDocRef = doc(this.firestore, `restaurant_settings/${user.uid}`);
        await setDoc(catDocRef, { 
          recipeCategories: categories, 
          updatedAt: new Date().toISOString() 
        }, { merge: true });
      } catch (err) {
        console.warn('Could not sync categories to Firestore:', err);
      }
    }
  }

  /**
   * Dodaje nową kategorię dań
   */
  async addCategory(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const exists = this.allCategories().some(c => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) return false;

    const updated = Array.from(new Set([...this.customCategories(), trimmed]));
    this.customCategories.set(updated);
    this.saveCategoriesToStorage(updated);
    await this.syncCategoriesToFirestore(updated);
    return true;
  }

  /**
   * Zmienia nazwę kategorii i automatycznie aktualizuje wszystkie powiązane przepisy
   */
  async renameCategory(oldName: string, newName: string): Promise<boolean> {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedOld.toLowerCase() === trimmedNew.toLowerCase()) {
      return false;
    }

    const user = this.authService.currentUser();
    const affected = this.recipes().filter(
      r => (r.category || '').trim().toLowerCase() === trimmedOld.toLowerCase()
    );

    // 1. Zaktualizuj przepisy w Firestore
    for (const r of affected) {
      if (user && !r.id.startsWith('recipe-local-')) {
        try {
          const docRef = doc(this.firestore, `recipes/${r.id}`);
          await updateDoc(docRef, { 
            category: trimmedNew, 
            updatedAt: new Date().toISOString() 
          });
        } catch (err) {
          console.warn(`Error updating recipe ${r.id} category:`, err);
        }
      }
    }

    // 2. Zaktualizuj stan lokalny przepisów
    const updatedRecipes = this.recipes().map(r => 
      (r.category || '').trim().toLowerCase() === trimmedOld.toLowerCase()
        ? { ...r, category: trimmedNew, updatedAt: new Date().toISOString() } 
        : r
    );
    this.recipes.set(updatedRecipes);
    this.saveToLocalFallback(updatedRecipes);

    // 3. Zaktualizuj listę zdefiniowanych kategorii
    const currentCustom = this.customCategories();
    const newCustom = currentCustom.map(c => 
      c.trim().toLowerCase() === trimmedOld.toLowerCase() ? trimmedNew : c
    );
    if (!newCustom.some(c => c.toLowerCase() === trimmedNew.toLowerCase())) {
      newCustom.push(trimmedNew);
    }
    const cleanCustom = Array.from(new Set(newCustom));
    this.customCategories.set(cleanCustom);
    this.saveCategoriesToStorage(cleanCustom);
    await this.syncCategoriesToFirestore(cleanCustom);

    return true;
  }

  /**
   * Usuwa kategorię; jeśli kategoria zawierała dania, przenosi je do fallbackCategory
   */
  async deleteCategory(categoryName: string, targetCategory?: string): Promise<void> {
    const trimmed = categoryName.trim();
    const fallback = targetCategory?.trim() || 'Inne';

    const user = this.authService.currentUser();
    const affected = this.recipes().filter(
      r => (r.category || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    // 1. Jeśli kategoria miała przypisane dania, przepisz je na wybraną kategorię docelową
    if (affected.length > 0) {
      for (const r of affected) {
        if (user && !r.id.startsWith('recipe-local-')) {
          try {
            const docRef = doc(this.firestore, `recipes/${r.id}`);
            await updateDoc(docRef, { 
              category: fallback, 
              updatedAt: new Date().toISOString() 
            });
          } catch (err) {
            console.warn(`Error reassigning category for recipe ${r.id}:`, err);
          }
        }
      }

      const updatedRecipes = this.recipes().map(r => 
        (r.category || '').trim().toLowerCase() === trimmed.toLowerCase()
          ? { ...r, category: fallback, updatedAt: new Date().toISOString() } 
          : r
      );
      this.recipes.set(updatedRecipes);
      this.saveToLocalFallback(updatedRecipes);
    }

    // 2. Usuń kategorię z listy customCategories
    const cleanCustom = this.customCategories().filter(
      c => c.trim().toLowerCase() !== trimmed.toLowerCase()
    );
    this.customCategories.set(cleanCustom);
    this.saveCategoriesToStorage(cleanCustom);
    await this.syncCategoriesToFirestore(cleanCustom);
  }
}
