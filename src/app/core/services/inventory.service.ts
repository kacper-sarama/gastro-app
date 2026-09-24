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
import { ToastService } from './toast.service';
import { InventoryItem, formatStockAmount, getStockStatus } from '../models/inventory-item.model';

const LOCAL_STORAGE_KEY = 'gastro_inventory_items_fallback';
const INVENTORY_CATEGORIES_STORAGE_KEY = 'gastro_inventory_categories_fallback';
const DEFAULT_INVENTORY_CATEGORIES = ['Suche', 'Nabiał', 'Przetwory', 'Warzywa', 'Mięso i wędliny', 'Dodatki', 'Tłuszcze', 'Zioła'];

const STARTER_INGREDIENTS: Omit<InventoryItem, 'id' | 'restaurantId'>[] = [
  { name: 'Mąka pszenna (typ 00)', amount: 25000, unit: 'g', minAmount: 5000, category: 'Suche' },
  { name: 'Drożdże piekarnicze', amount: 500, unit: 'g', minAmount: 100, category: 'Dodatki' },
  { name: 'Oliwa z oliwek Extra Virgin', amount: 5000, unit: 'ml', minAmount: 1000, category: 'Tłuszcze' },
  { name: 'Sos pomidorowy San Marzano', amount: 8000, unit: 'ml', minAmount: 2000, category: 'Przetwory' },
  { name: 'Ser Mozzarella fior di latte', amount: 6500, unit: 'g', minAmount: 3000, category: 'Nabiał' },
  { name: 'Pieczarki świeże', amount: 900, unit: 'g', minAmount: 1500, category: 'Warzywa' }, // Niski stan ostrzegawczy
  { name: 'Świeża bazylia', amount: 0, unit: 'szt', minAmount: 5, category: 'Zioła' }, // Brak do alertu
  { name: 'Salami Spianata Piccante', amount: 1800, unit: 'g', minAmount: 600, category: 'Mięso i wędliny' },
  { name: 'Szynka Prosciutto Cotto', amount: 2000, unit: 'g', minAmount: 800, category: 'Mięso i wędliny' },
  { name: 'Szynka Prosciutto Crudo', amount: 1500, unit: 'g', minAmount: 500, category: 'Mięso i wędliny' },
  { name: 'Ser Gorgonzola DOP', amount: 1200, unit: 'g', minAmount: 400, category: 'Nabiał' },
  { name: 'Ser Grana Padano DOP', amount: 1500, unit: 'g', minAmount: 500, category: 'Nabiał' },
  { name: 'Świeża ricotta', amount: 1200, unit: 'g', minAmount: 500, category: 'Nabiał' },
  { name: 'Pomidorki koktajlowe', amount: 2000, unit: 'g', minAmount: 800, category: 'Warzywa' },
  { name: 'Świeża rukola', amount: 800, unit: 'g', minAmount: 300, category: 'Warzywa' },
  { name: 'Świeży rozmaryn', amount: 150, unit: 'g', minAmount: 50, category: 'Zioła' },
  { name: 'Ser Mascarpone', amount: 1500, unit: 'g', minAmount: 500, category: 'Nabiał' },
  { name: 'Biszkopty Savoiardi', amount: 800, unit: 'g', minAmount: 300, category: 'Suche' },
  { name: 'Kawa ziarnista Espresso', amount: 1000, unit: 'g', minAmount: 300, category: 'Suche' },
  { name: 'Śmietanka 36%', amount: 2000, unit: 'ml', minAmount: 600, category: 'Nabiał' },
  { name: 'Maliny mrożone / sos', amount: 1200, unit: 'g', minAmount: 400, category: 'Przetwory' }
];

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  readonly items = signal<InventoryItem[]>([]);
  readonly customCategories = signal<string[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // Unikalne kategorie surowców (z produktów oraz zdefiniowane ręcznie)
  readonly allCategories = computed<string[]>(() => {
    const set = new Set<string>();
    for (const item of this.items()) {
      if (item.category && item.category.trim()) {
        set.add(item.category.trim());
      }
    }
    for (const c of this.customCategories()) {
      if (c && c.trim()) {
        set.add(c.trim());
      }
    }
    DEFAULT_INVENTORY_CATEGORIES.forEach(c => set.add(c));
    return Array.from(set).sort();
  });

  // Wyliczane sygnały stanu
  readonly totalItemsCount = computed(() => this.items().length);

  readonly outOfStockItems = computed(() => 
    this.items().filter(item => getStockStatus(item) === 'out')
  );

  readonly lowStockItems = computed(() => 
    this.items().filter(item => getStockStatus(item) === 'low')
  );

  readonly healthyStockItems = computed(() => 
    this.items().filter(item => getStockStatus(item) === 'ok')
  );

  readonly criticalAlertsCount = computed(() => 
    this.outOfStockItems().length + this.lowStockItems().length
  );

  private firestoreUnsub: Unsubscribe | null = null;
  private categoriesUnsub: Unsubscribe | null = null;

  constructor() {
    // Automatycznie reaguj na zmianę stanu logowania
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.initFirestoreSubscription(user.uid);
      } else {
        this.loadLocalFallback();
      }
    });
  }

  /**
   * Pozwala załadować dane magazynowe wskazanego lokalu (np. dla gościa przeglądającego kartę dań)
   */
  loadRestaurantData(restaurantId: string): void {
    if (restaurantId && restaurantId !== 'demo-restaurant') {
      this.initFirestoreSubscription(restaurantId);
    } else {
      this.loadLocalFallback();
    }
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
      const settingsDocRef = doc(this.firestore, `restaurant_settings/${restaurantId}`);
      this.categoriesUnsub = onSnapshot(settingsDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.['inventoryCategories'])) {
            this.customCategories.set(data['inventoryCategories']);
          }
        }
      }, () => {
        // Fallback do pamięci lokalnej jeśli brak dokumentu
      });

      // 2. Subskrypcja surowców magazynowych
      const inventoryCol = collection(this.firestore, 'inventory');
      const q = query(inventoryCol, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as InventoryItem));

        if (items.length === 0) {
          // Tylko zalogowany właściciel może seedować początkowe składniki do Firestore
          if (this.authService.currentUser()?.uid === restaurantId) {
            this.seedStarterIngredientsToFirestore(restaurantId);
          } else {
            this.items.set([]);
            this.isLoading.set(false);
          }
        } else {
          // Sprawdź czy lokal ma wszystkie surowce ze zdefiniowanego zestawu startowego
          const existingNames = new Set(items.map(i => i.name.toLowerCase().trim()));
          const missing = STARTER_INGREDIENTS.filter(s => !existingNames.has(s.name.toLowerCase().trim()));

          if (missing.length > 0) {
            // Natychmiast syntetyzujemy brakujące surowce w pamięci (signal items),
            // generując dla nich oficjalne ID dokumentów Firestore. Dzięki temu widok magazynu
            // i dropdowny w recepturach od razu widzą Prosciutto Cotto, Salami Spianata itp. bez opóźnienia sieciowego.
            const synthesized: InventoryItem[] = missing.map(m => {
              const newDocRef = doc(collection(this.firestore, 'inventory'));
              return {
                ...m,
                id: newDocRef.id,
                restaurantId,
                updatedAt: new Date().toISOString()
              };
            });

            const fullList = [...items, ...synthesized];
            this.items.set(fullList);
            this.saveToLocalFallback(fullList);

            if (restaurantId && restaurantId !== 'demo-restaurant') {
              this.ensureMissingStarterIngredients(restaurantId, synthesized);
            }
          } else {
            this.items.set(items);
            this.saveToLocalFallback(items);
          }
          this.isLoading.set(false);
        }
      }, (err) => {
        console.warn('Firestore subscription fallback to local storage:', err);
        this.loadLocalFallback();
        this.isLoading.set(false);
      });
    } catch (err) {
      console.warn('Firestore initialization fallback:', err);
      this.loadLocalFallback();
      this.isLoading.set(false);
    }
  }

  private isEnsuringStarter = false;

  private async ensureMissingStarterIngredients(restaurantId: string, itemsToCreate: InventoryItem[]): Promise<void> {
    if (this.isEnsuringStarter || itemsToCreate.length === 0) return;
    this.isEnsuringStarter = true;

    try {
      const user = this.authService.currentUser();
      if (user && user.uid === restaurantId) {
        for (const item of itemsToCreate) {
          try {
            const itemDoc = doc(this.firestore, `inventory/${item.id}`);
            await setDoc(itemDoc, this.cleanObject(item));
          } catch (itemErr) {
            console.warn(`Błąd zapisu surowca ${item.name} do Firestore:`, itemErr);
          }
        }
      }
    } catch (e) {
      console.warn('Błąd uzupełniania brakujących składników:', e);
    } finally {
      this.isEnsuringStarter = false;
    }
  }

  private async seedStarterIngredientsToFirestore(restaurantId: string): Promise<void> {
    try {
      const createdItems: InventoryItem[] = [];
      for (const item of STARTER_INGREDIENTS) {
        const itemDoc = doc(collection(this.firestore, 'inventory'));
        const newItem: InventoryItem = {
          ...item,
          id: itemDoc.id,
          restaurantId,
          updatedAt: new Date().toISOString()
        };
        createdItems.push(newItem);
        await setDoc(itemDoc, this.cleanObject(newItem));
      }
      this.items.set(createdItems);
      this.saveToLocalFallback(createdItems);
    } catch (e) {
      console.warn('Błąd zapisu składników do Firestore:', e);
      this.loadLocalFallback();
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadLocalFallback(): void {
    const rawCategories = localStorage.getItem(INVENTORY_CATEGORIES_STORAGE_KEY);
    if (rawCategories) {
      try {
        this.customCategories.set(JSON.parse(rawCategories));
      } catch (e) {
        // Fallback
      }
    }

    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: InventoryItem[] = JSON.parse(raw);
        const existingNames = new Set(parsed.map(i => i.name.toLowerCase().trim()));
        const missing = STARTER_INGREDIENTS.filter(s => !existingNames.has(s.name.toLowerCase().trim()));
        if (missing.length === 0) {
          this.items.set(parsed);
          return;
        }
        // Uzupełnij lokalnie brakujące
        const additional: InventoryItem[] = missing.map((m, idx) => ({
          ...m,
          id: `local-item-${parsed.length + idx + 1}`,
          restaurantId: 'demo-restaurant',
          updatedAt: new Date().toISOString()
        }));
        const combined = [...parsed, ...additional];
        this.items.set(combined);
        this.saveToLocalFallback(combined);
        return;
      } catch (e) {
        // Fallback do domyślnych jeśli błąd parsowania
      }
    }

    // Załaduj pełny zestaw demonstracyjny (21 surowców)
    const initialWithIds: InventoryItem[] = STARTER_INGREDIENTS.map((item, index) => ({
      ...item,
      id: `local-item-${index + 1}`,
      restaurantId: 'demo-restaurant',
      updatedAt: new Date().toISOString()
    }));

    this.items.set(initialWithIds);
    this.saveToLocalFallback(initialWithIds);
  }

  private saveToLocalFallback(items: InventoryItem[]): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  }

  /**
   * Usuwa pola undefined (Firestore ich nie obsługuje)
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

  private addLocalItem(item: InventoryItem): void {
    const updated = [item, ...this.items()];
    this.items.set(updated);
    this.saveToLocalFallback(updated);
  }

  private updateLocalItem(id: string, fields: Partial<InventoryItem>): void {
    const updated = this.items().map(i => i.id === id ? { ...i, ...fields } : i);
    this.items.set(updated);
    this.saveToLocalFallback(updated);
  }

  private deleteLocalItem(id: string): void {
    const updated = this.items().filter(i => i.id !== id);
    this.items.set(updated);
    this.saveToLocalFallback(updated);
  }

  // --- Główne metody CRUD ---

  async addItem(data: Omit<InventoryItem, 'id' | 'restaurantId'>): Promise<void> {
    const user = this.authService.currentUser();
    const itemData = this.cleanObject({
      ...data,
      restaurantId: user ? user.uid : 'demo-restaurant',
      updatedAt: new Date().toISOString()
    });

    if (user) {
      try {
        await addDoc(collection(this.firestore, 'inventory'), itemData);
        this.toastService.success(`Dodano surowiec "${data.name}" do magazynu.`, 'Magazyn');
        return;
      } catch (err) {
        console.warn('Błąd zapisu do Firestore, używam trybu lokalnego:', err);
      }
    }

    this.addLocalItem({ ...itemData, id: `local-item-${Date.now()}` } as InventoryItem);
    this.toastService.success(`Dodano surowiec "${data.name}" do magazynu.`, 'Magazyn');
  }

  async updateItem(id: string, partial: Partial<InventoryItem>): Promise<void> {
    const user = this.authService.currentUser();
    const fields = this.cleanObject({
      ...partial,
      updatedAt: new Date().toISOString()
    });

    if (user && !id.startsWith('local-item-')) {
      try {
        await updateDoc(doc(this.firestore, `inventory/${id}`), fields);
        return;
      } catch (err) {
        console.warn('Błąd aktualizacji w Firestore:', err);
      }
    }

    this.updateLocalItem(id, fields);
  }

  async deleteItem(id: string): Promise<void> {
    const user = this.authService.currentUser();
    const target = this.items().find(i => i.id === id);

    if (user && !id.startsWith('local-item-')) {
      try {
        await deleteDoc(doc(this.firestore, `inventory/${id}`));
        this.toastService.danger(`Usunięto surowiec "${target?.name || 'Składnik'}" z magazynu.`, 'Magazyn');
        return;
      } catch (err) {
        console.warn('Błąd usuwania w Firestore:', err);
      }
    }

    this.deleteLocalItem(id);
    this.toastService.danger(`Usunięto surowiec "${target?.name || 'Składnik'}" z magazynu.`, 'Magazyn');
  }

  /**
   * Szybka dostawa lub zużycie (np. + 5000g, - 200g)
   */
  async quickAdjustStock(id: string, deltaAmount: number): Promise<void> {
    const target = this.items().find(i => i.id === id);
    if (!target) return;

    const newAmount = Math.max(0, target.amount + deltaAmount);
    await this.updateItem(id, { amount: newAmount });

    if (deltaAmount > 0) {
      const deltaStr = formatStockAmount(deltaAmount, target.unit).display;
      const totalStr = formatStockAmount(newAmount, target.unit).display;
      this.toastService.success(
        `Przyjęto dostawę +${deltaStr} dla "${target.name}". Stan: ${totalStr}.`,
        'Dostawa przyjęta'
      );
    } else if (newAmount === 0) {
      this.toastService.danger(
        `Surowiec "${target.name}" został wyczerpany do zera! Powiązane pozycje mogą zostać zablokowane.`,
        'Brak surowca w magazynie'
      );
    } else if (newAmount <= target.minAmount) {
      const currentStr = formatStockAmount(newAmount, target.unit).display;
      const minStr = formatStockAmount(target.minAmount, target.unit).display;
      this.toastService.warning(
        `Stan "${target.name}" spadł poniżej progu (${currentStr} / min. ${minStr}). Wymagane zamówienie!`,
        'Niski stan magazynowy'
      );
    }
  }

  // ==========================================
  // ZARZĄDZANIE KATEGORIAMI SUROWCÓW
  // ==========================================

  getCategoryItemCount(category: string): number {
    return this.items().filter(i => (i.category || '').trim().toLowerCase() === category.trim().toLowerCase()).length;
  }

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

  async renameCategory(oldName: string, newName: string): Promise<boolean> {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedOld.toLowerCase() === trimmedNew.toLowerCase()) {
      return false;
    }

    const user = this.authService.currentUser();
    const affected = this.items().filter(
      i => (i.category || '').trim().toLowerCase() === trimmedOld.toLowerCase()
    );

    // 1. Aktualizacja surowców w Firestore
    for (const item of affected) {
      if (user && !item.id.startsWith('local-item-')) {
        try {
          const docRef = doc(this.firestore, `inventory/${item.id}`);
          await updateDoc(docRef, { 
            category: trimmedNew, 
            updatedAt: new Date().toISOString() 
          });
        } catch (err) {
          console.warn(`Error updating inventory item ${item.id} category:`, err);
        }
      }
    }

    // 2. Aktualizacja stanu lokalnego surowców
    const updatedItems = this.items().map(i => 
      (i.category || '').trim().toLowerCase() === trimmedOld.toLowerCase()
        ? { ...i, category: trimmedNew, updatedAt: new Date().toISOString() } 
        : i
    );
    this.items.set(updatedItems);
    this.saveToLocalFallback(updatedItems);

    // 3. Aktualizacja listy kategorii
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

  async deleteCategory(categoryName: string, targetCategory?: string): Promise<void> {
    const trimmed = categoryName.trim();
    const fallback = targetCategory?.trim() || 'Dodatki';

    const user = this.authService.currentUser();
    const affected = this.items().filter(
      i => (i.category || '').trim().toLowerCase() === trimmed.toLowerCase()
    );

    // 1. Przepięcie surowców do nowej kategorii
    if (affected.length > 0) {
      for (const item of affected) {
        if (user && !item.id.startsWith('local-item-')) {
          try {
            const docRef = doc(this.firestore, `inventory/${item.id}`);
            await updateDoc(docRef, { 
              category: fallback, 
              updatedAt: new Date().toISOString() 
            });
          } catch (err) {
            console.warn(`Error reassigning category for item ${item.id}:`, err);
          }
        }
      }

      const updatedItems = this.items().map(i => 
        (i.category || '').trim().toLowerCase() === trimmed.toLowerCase()
          ? { ...i, category: fallback, updatedAt: new Date().toISOString() } 
          : i
      );
      this.items.set(updatedItems);
      this.saveToLocalFallback(updatedItems);
    }

    // 2. Usunięcie z customCategories
    const cleanCustom = this.customCategories().filter(
      c => c.trim().toLowerCase() !== trimmed.toLowerCase()
    );
    this.customCategories.set(cleanCustom);
    this.saveCategoriesToStorage(cleanCustom);
    await this.syncCategoriesToFirestore(cleanCustom);
  }

  private saveCategoriesToStorage(categories: string[]): void {
    localStorage.setItem(INVENTORY_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  }

  private async syncCategoriesToFirestore(categories: string[]): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    try {
      const docRef = doc(this.firestore, `restaurant_settings/${user.uid}`);
      await setDoc(docRef, { inventoryCategories: categories }, { merge: true });
    } catch (err) {
      console.warn('Error syncing inventory categories to Firestore:', err);
    }
  }
}
