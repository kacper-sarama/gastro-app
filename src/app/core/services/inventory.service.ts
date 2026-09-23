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
import { InventoryItem, getStockStatus } from '../models/inventory-item.model';
import { Subscription } from 'rxjs';

const LOCAL_STORAGE_KEY = 'gastro_inventory_items_fallback';

const STARTER_INGREDIENTS: Omit<InventoryItem, 'id' | 'restaurantId'>[] = [
  { name: 'Mąka pszenna (typ 00)', amount: 15000, unit: 'g', minAmount: 5000, category: 'Suche' },
  { name: 'Ser Mozzarella fior di latte', amount: 4500, unit: 'g', minAmount: 3000, category: 'Nabiał' },
  { name: 'Sos pomidorowy San Marzano', amount: 6000, unit: 'ml', minAmount: 2000, category: 'Przetwory' },
  { name: 'Pieczarki świeże', amount: 800, unit: 'g', minAmount: 1500, category: 'Warzywa' }, // Niski stan
  { name: 'Drożdże piekarnicze', amount: 250, unit: 'g', minAmount: 100, category: 'Dodatki' },
  { name: 'Oliwa z oliwek Extra Virgin', amount: 2500, unit: 'ml', minAmount: 1000, category: 'Tłuszcze' },
  { name: 'Świeża bazylia', amount: 0, unit: 'szt', minAmount: 5, category: 'Zioła' } // Brak
];

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  readonly items = signal<InventoryItem[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

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

  private initFirestoreSubscription(restaurantId: string): void {
    this.isLoading.set(true);
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }

    try {
      const inventoryCol = collection(this.firestore, 'inventory');
      const q = query(inventoryCol, where('restaurantId', '==', restaurantId));

      this.firestoreUnsub = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as InventoryItem));

        if (items.length === 0) {
          // Jeśli baza użytkownika jest pusta, załaduj składniki startowe do Firestore
          this.seedStarterIngredientsToFirestore(restaurantId);
        } else {
          this.items.set(items);
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

  private async seedStarterIngredientsToFirestore(restaurantId: string): Promise<void> {
    try {
      const inventoryCol = collection(this.firestore, 'inventory');
      for (const item of STARTER_INGREDIENTS) {
        await addDoc(inventoryCol, {
          ...item,
          restaurantId,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (e) {
      this.loadLocalFallback();
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadLocalFallback(): void {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        this.items.set(JSON.parse(raw));
        return;
      } catch (e) {
        // Fallback do domyślnych jeśli błąd parsowania
      }
    }

    // Załaduj zestaw demonstracyjny
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
        return;
      } catch (err) {
        console.warn('Błąd zapisu do Firestore, używam trybu lokalnego:', err);
      }
    }

    this.addLocalItem({ ...itemData, id: `local-item-${Date.now()}` } as InventoryItem);
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

    if (user && !id.startsWith('local-item-')) {
      try {
        await deleteDoc(doc(this.firestore, `inventory/${id}`));
        return;
      } catch (err) {
        console.warn('Błąd usuwania w Firestore:', err);
      }
    }

    this.deleteLocalItem(id);
  }

  /**
   * Szybka dostawa lub zużycie (np. + 5000g, - 200g)
   */
  async quickAdjustStock(id: string, deltaAmount: number): Promise<void> {
    const target = this.items().find(i => i.id === id);
    if (!target) return;

    const newAmount = Math.max(0, target.amount + deltaAmount);
    await this.updateItem(id, { amount: newAmount });
  }
}
