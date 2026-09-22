import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { 
  Firestore, 
  collection, 
  collectionData, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where 
} from '@angular/fire/firestore';
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

  private firestoreSub: Subscription | null = null;

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
    if (this.firestoreSub) {
      this.firestoreSub.unsubscribe();
    }

    try {
      const inventoryCol = collection(this.firestore, 'inventory');
      const q = query(inventoryCol, where('restaurantId', '==', restaurantId));

      this.firestoreSub = collectionData(q, { idField: 'id' }).subscribe({
        next: (docs) => {
          const items = docs as InventoryItem[];
          if (items.length === 0) {
            // Jeśli baza użytkownika jest pusta, załaduj składniki startowe do Firestore
            this.seedStarterIngredientsToFirestore(restaurantId);
          } else {
            this.items.set(items);
            this.isLoading.set(false);
          }
        },
        error: (err) => {
          console.warn('Firestore subscription fallback to local storage:', err);
          this.loadLocalFallback();
          this.isLoading.set(false);
        }
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

  // --- CRUD Operacje ---

  async addItem(data: Omit<InventoryItem, 'id' | 'restaurantId'>): Promise<void> {
    const user = this.authService.currentUser();
    const newItemData = {
      ...data,
      restaurantId: user ? user.uid : 'demo-restaurant',
      updatedAt: new Date().toISOString()
    };

    if (user) {
      try {
        const inventoryCol = collection(this.firestore, 'inventory');
        await addDoc(inventoryCol, newItemData);
        return;
      } catch (err) {
        console.warn('Error adding doc to Firestore, using fallback:', err);
      }
    }

    // Fallback lokalny
    const current = this.items();
    const item: InventoryItem = {
      ...newItemData,
      id: `local-item-${Date.now()}`
    };
    const updated = [item, ...current];
    this.items.set(updated);
    this.saveToLocalFallback(updated);
  }

  async updateItem(id: string, partial: Partial<InventoryItem>): Promise<void> {
    const user = this.authService.currentUser();
    const updatedFields = {
      ...partial,
      updatedAt: new Date().toISOString()
    };

    if (user && !id.startsWith('local-item-')) {
      try {
        const docRef = doc(this.firestore, `inventory/${id}`);
        await updateDoc(docRef, updatedFields);
        return;
      } catch (err) {
        console.warn('Error updating Firestore doc:', err);
      }
    }

    // Fallback lokalny
    const updated = this.items().map(item => 
      item.id === id ? { ...item, ...updatedFields } : item
    );
    this.items.set(updated);
    this.saveToLocalFallback(updated);
  }

  async deleteItem(id: string): Promise<void> {
    const user = this.authService.currentUser();

    if (user && !id.startsWith('local-item-')) {
      try {
        const docRef = doc(this.firestore, `inventory/${id}`);
        await deleteDoc(docRef);
        return;
      } catch (err) {
        console.warn('Error deleting Firestore doc:', err);
      }
    }

    // Fallback lokalny
    const updated = this.items().filter(item => item.id !== id);
    this.items.set(updated);
    this.saveToLocalFallback(updated);
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
