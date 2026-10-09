import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../core/services/promotion.service';
import { AuthService } from '../../core/services/auth.service';
import { RecipeService } from '../../core/services/recipe.service';
import { InventoryService } from '../../core/services/inventory.service';
import { ToastService } from '../../core/services/toast.service';
import { Promotion, PromotionRecommendation } from '../../core/models/promotion.model';
import { PromotionModalComponent } from './promotion-modal.component';

@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [CommonModule, FormsModule, PromotionModalComponent],
  templateUrl: './promotions-list.component.html'
})
export class PromotionsListComponent {
  readonly promotionService = inject(PromotionService);
  readonly authService = inject(AuthService);
  readonly recipeService = inject(RecipeService);
  readonly inventoryService = inject(InventoryService);
  readonly toastService = inject(ToastService);

  // Filtrowanie
  searchQuery = signal<string>('');
  filterType = signal<string>('all'); // 'all' | 'active' | 'bogo' | 'upsell' | 'threshold' | 'happy_hours'

  // Modal zarządzania
  isModalOpen = signal<boolean>(false);
  selectedPromotionToEdit = signal<Promotion | null>(null);
  selectedRecommendationToApply = signal<PromotionRecommendation | null>(null);

  isSeedingStarter = signal<boolean>(false);

  readonly filteredPromotions = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const type = this.filterType();
    let list = this.promotionService.promotions();

    if (type === 'active') {
      list = list.filter(p => p.isActive);
    } else if (type !== 'all') {
      list = list.filter(p => p.type === type);
    }

    if (query) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        (p.code && p.code.toLowerCase().includes(query)) ||
        (p.badgeText && p.badgeText.toLowerCase().includes(query))
      );
    }

    return list;
  });

  openCreateModal(): void {
    this.selectedPromotionToEdit.set(null);
    this.selectedRecommendationToApply.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(promo: Promotion): void {
    this.selectedPromotionToEdit.set(promo);
    this.selectedRecommendationToApply.set(null);
    this.isModalOpen.set(true);
  }

  applyRecommendation(rec: PromotionRecommendation): void {
    this.selectedPromotionToEdit.set(null);
    this.selectedRecommendationToApply.set(rec);
    this.isModalOpen.set(true);
  }

  async quickActivateRecommendation(rec: PromotionRecommendation): Promise<void> {
    try {
      await this.promotionService.createPromotion({
        name: rec.name,
        description: rec.description,
        badgeText: rec.badgeText,
        type: rec.type,
        condition: rec.condition,
        reward: rec.reward,
        isActive: true,
        isSmartRecommendation: true,
        recommendationReason: rec.reason
      });
    } catch {
      // toast obsłużony w serwisie
    }
  }

  async togglePromotionStatus(promo: Promotion): Promise<void> {
    await this.promotionService.togglePromotion(promo.id, promo.isActive);
  }

  async deletePromotion(promo: Promotion): Promise<void> {
    await this.promotionService.deletePromotion(promo.id);
  }

  async loadStarterPromotions(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) return;

    if (this.promotionService.promotions().length > 0) {
      if (!confirm('Czy chcesz załadować gotowe szablony promocji (zastąpią one obecną listę)?')) {
        return;
      }
    }

    this.isSeedingStarter.set(true);
    try {
      await this.promotionService.resetToStarter(user.uid, this.recipeService.recipes());
      this.toastService.success('Załadowano zestaw wzorcowych promocji!', 'Szablony Promocji');
    } catch (e: any) {
      this.toastService.danger('Błąd ładowania szablonów: ' + (e?.message || ''), 'Błąd');
    } finally {
      this.isSeedingStarter.set(false);
    }
  }
}
