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
  Unsubscribe 
} from 'firebase/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { 
  Recipe, 
  RecipeCapacityResult, 
  calculateRecipeCapacity 
} from '../models/recipe.model';
import { Subscription } from 'rxjs';

const LOCAL_STORAGE_KEY = 'gastro_recipes_fallback';

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);

  readonly recipes = signal<Recipe[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private firestoreUnsub: Unsubscribe | null = null;

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

    try {
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

  private sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  async addRecipe(data: Omit<Recipe, 'id' | 'restaurantId' | 'updatedAt'>): Promise<void> {
    const user = this.authService.currentUser();
    const newRecipeData = this.sanitizeForFirestore({
      ...data,
      restaurantId: user ? user.uid : 'demo-restaurant',
      updatedAt: new Date().toISOString()
    }) as any;

    if (user) {
      try {
        const col = collection(this.firestore, 'recipes');
        await addDoc(col, newRecipeData);
        return;
      } catch (err) {
        console.warn('Error saving recipe to Firestore:', err);
      }
    }

    const current = this.recipes();
    const recipe: Recipe = {
      ...newRecipeData,
      id: `recipe-local-${Date.now()}`
    };
    const updated = [recipe, ...current];
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }

  async updateRecipe(id: string, partial: Partial<Recipe>): Promise<void> {
    const user = this.authService.currentUser();
    const updatedFields = this.sanitizeForFirestore({
      ...partial,
      updatedAt: new Date().toISOString()
    }) as any;

    if (user && !id.startsWith('recipe-local-')) {
      try {
        const docRef = doc(this.firestore, `recipes/${id}`);
        await updateDoc(docRef, updatedFields);
        return;
      } catch (err) {
        console.warn('Error updating recipe in Firestore:', err);
      }
    }

    const updated = this.recipes().map(r => r.id === id ? { ...r, ...updatedFields } : r);
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }

  async deleteRecipe(id: string): Promise<void> {
    const user = this.authService.currentUser();

    if (user && !id.startsWith('recipe-local-')) {
      try {
        const docRef = doc(this.firestore, `recipes/${id}`);
        await deleteDoc(docRef);
        return;
      } catch (err) {
        console.warn('Error deleting recipe in Firestore:', err);
      }
    }

    const updated = this.recipes().filter(r => r.id !== id);
    this.recipes.set(updated);
    this.saveToLocalFallback(updated);
  }
}
