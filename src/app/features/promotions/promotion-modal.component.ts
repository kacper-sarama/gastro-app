import { Component, EventEmitter, Input, Output, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { PromotionService } from '../../core/services/promotion.service';
import { RecipeService } from '../../core/services/recipe.service';
import {
  Promotion,
  PromotionType,
  PromotionCondition,
  PromotionReward
} from '../../core/models/promotion.model';

export interface PromotionModalData {
  promotionToEdit?: Promotion | null;
  initialRecommendation?: any | null;
}

@Component({
  selector: 'app-promotion-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatFormFieldModule],
  templateUrl: './promotion-modal.component.html'
})
export class PromotionModalComponent implements OnInit {
  private promotionService = inject(PromotionService);
  readonly recipeService = inject(RecipeService);
  private dialogRef = inject<MatDialogRef<PromotionModalComponent>>(MatDialogRef, { optional: true });
  private dialogData = inject<PromotionModalData>(MAT_DIALOG_DATA, { optional: true });

  @Input() promotionToEdit: Promotion | null = null;
  @Input() initialRecommendation: any | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  isSaving = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Formularz stan
  name = signal<string>('');
  description = signal<string>('');
  code = signal<string>('');
  badgeText = signal<string>('PROMOCJA 🔥');
  type = signal<PromotionType>('bogo');
  isActive = signal<boolean>(true);

  // Warunki
  minOrderValue = signal<number | null>(null);
  requiredCategory = signal<string>('');
  requiredQuantity = signal<number>(1);
  selectedDays = signal<number[]>([]); // 0=ndz, 1=pon, 2=wt...
  startTime = signal<string>('');
  endTime = signal<string>('');

  // Nagroda / Korzyść
  rewardType = signal<'discount_percent' | 'discount_amount' | 'special_price_item' | 'free_item'>('discount_percent');
  discountValue = signal<number>(50);
  rewardRecipeId = signal<string>('');
  specialPrice = signal<number>(4.0);

  readonly availableCategories = computed(() => {
    const recipes = this.recipeService.recipes();
    const set = new Set<string>();
    recipes.forEach(r => {
      if (r.category?.trim()) set.add(r.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'));
  });

  readonly availableRecipes = computed(() => {
    return this.recipeService.recipes().filter(r => r.isAvailable !== false);
  });

  readonly daysOfWeek = [
    { id: 1, label: 'Pon' },
    { id: 2, label: 'Wt' },
    { id: 3, label: 'Śr' },
    { id: 4, label: 'Czw' },
    { id: 5, label: 'Pt' },
    { id: 6, label: 'Sob' },
    { id: 0, label: 'Nd' }
  ];

  ngOnInit(): void {
    if (this.dialogData) {
      if (this.dialogData.promotionToEdit !== undefined) {
        this.promotionToEdit = this.dialogData.promotionToEdit;
      }
      if (this.dialogData.initialRecommendation !== undefined) {
        this.initialRecommendation = this.dialogData.initialRecommendation;
      }
    }

    if (this.promotionToEdit) {
      const p = this.promotionToEdit;
      this.name.set(p.name);
      this.description.set(p.description);
      this.code.set(p.code || '');
      this.badgeText.set(p.badgeText || 'PROMOCJA 🔥');
      this.type.set(p.type);
      this.isActive.set(p.isActive);

      this.minOrderValue.set(p.condition.minOrderValue || null);
      this.requiredCategory.set(p.condition.requiredCategory || '');
      this.requiredQuantity.set(p.condition.requiredQuantity || 1);
      this.selectedDays.set(p.condition.applicableDays || []);
      this.startTime.set(p.condition.startTime || '');
      this.endTime.set(p.condition.endTime || '');

      this.rewardType.set(p.reward.rewardType);
      this.discountValue.set(p.reward.discountValue || 10);
      this.rewardRecipeId.set(p.reward.rewardRecipeId || '');
      this.specialPrice.set(p.reward.specialPrice ?? 4.0);
    } else if (this.initialRecommendation) {
      const rec = this.initialRecommendation;
      this.name.set(rec.name);
      this.description.set(rec.description);
      this.badgeText.set(rec.badgeText || 'HIT ⭐');
      this.type.set(rec.type);
      if (rec.condition) {
        this.minOrderValue.set(rec.condition.minOrderValue || null);
        this.requiredCategory.set(rec.condition.requiredCategory || '');
        this.requiredQuantity.set(rec.condition.requiredQuantity || 1);
        this.selectedDays.set(rec.condition.applicableDays || []);
        this.startTime.set(rec.condition.startTime || '');
        this.endTime.set(rec.condition.endTime || '');
      }
      if (rec.reward) {
        this.rewardType.set(rec.reward.rewardType);
        this.discountValue.set(rec.reward.discountValue || 20);
        this.rewardRecipeId.set(rec.reward.rewardRecipeId || '');
        this.specialPrice.set(rec.reward.specialPrice ?? 4.0);
      }
    }
  }

  applyTemplate(templateType: 'bogo' | 'upsell' | 'threshold' | 'happy_hours'): void {
    if (templateType === 'bogo') {
      const firstCat = this.availableCategories()[0] || 'Dania Główne';
      this.type.set('bogo');
      this.name.set(`Wtorkowy Hit: Druga ${firstCat} -50%`);
      this.description.set(`Kup 2 pozycje z kategorii "${firstCat}", drugą otrzymasz za 50% ceny.`);
      this.badgeText.set('HIT TYGODNIA 🔥');
      this.requiredCategory.set(firstCat);
      this.requiredQuantity.set(2);
      this.selectedDays.set([2]); // Wtorek
      this.rewardType.set('discount_percent');
      this.discountValue.set(50);
    } else if (templateType === 'upsell') {
      const candidate = this.availableRecipes().find(r =>
        (r.category || '').toLowerCase().includes('deser') ||
        (r.category || '').toLowerCase().includes('napój')
      ) || this.availableRecipes()[0];

      this.type.set('upsell');
      this.name.set(candidate ? `Zestaw: ${candidate.name} za 4 zł` : 'Zestaw: Dodatek za 4 zł');
      this.description.set('Przy zamówieniu dania głównego dobierz deser lub napój za 4,00 zł.');
      this.badgeText.set('UPSELL ⭐');
      this.minOrderValue.set(25);
      this.rewardType.set('special_price_item');
      this.rewardRecipeId.set(candidate?.id || '');
      this.specialPrice.set(4.0);
    } else if (templateType === 'threshold') {
      this.type.set('threshold_bonus');
      this.name.set('Duży Koszyk: Od 80 zł rabat 15 zł');
      this.description.set('Automatyczny rabat 15 zł dla zamówień powyżej 80 zł.');
      this.badgeText.set('EKSTRA KOSZYK 🚀');
      this.minOrderValue.set(80);
      this.rewardType.set('discount_amount');
      this.discountValue.set(15);
    } else if (templateType === 'happy_hours') {
      this.type.set('happy_hours');
      this.name.set('Happy Hours: -20% w godz. 14:00 - 17:00');
      this.description.set('Rabat popołudniowy na całe zamówienie.');
      this.badgeText.set('HAPPY HOURS ⏰');
      this.startTime.set('14:00');
      this.endTime.set('17:00');
      this.rewardType.set('discount_percent');
      this.discountValue.set(20);
    }
  }

  toggleDay(dayId: number): void {
    const current = this.selectedDays();
    if (current.includes(dayId)) {
      this.selectedDays.set(current.filter(d => d !== dayId));
    } else {
      this.selectedDays.set([...current, dayId].sort());
    }
  }

  isDaySelected(dayId: number): boolean {
    return this.selectedDays().includes(dayId);
  }

  closeModal(): void {
    this.close.emit();
    this.dialogRef?.close();
  }

  async onSave(): Promise<void> {
    const nameVal = this.name().trim();
    if (!nameVal) {
      this.errorMessage.set('Podaj nazwę promocji.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const condition: PromotionCondition = {};
    if (this.minOrderValue() && this.minOrderValue()! > 0) {
      condition.minOrderValue = Number(this.minOrderValue());
    }
    if (this.requiredCategory()) {
      condition.requiredCategory = this.requiredCategory();
    }
    if (this.requiredQuantity() && this.requiredQuantity() > 1) {
      condition.requiredQuantity = Number(this.requiredQuantity());
    }
    if (this.selectedDays().length > 0) {
      condition.applicableDays = this.selectedDays();
    }
    if (this.startTime() && this.endTime()) {
      condition.startTime = this.startTime();
      condition.endTime = this.endTime();
    }

    const selectedRecipe = this.availableRecipes().find(r => r.id === this.rewardRecipeId());
    const reward: PromotionReward = {
      rewardType: this.rewardType(),
      discountValue: Number(this.discountValue()) || 0,
      rewardRecipeId: this.rewardRecipeId() || undefined,
      rewardRecipeName: selectedRecipe ? selectedRecipe.name : undefined,
      specialPrice: this.rewardType() === 'special_price_item' ? Number(this.specialPrice()) : undefined
    };

    const payload: Partial<Promotion> = {
      name: nameVal,
      description: this.description().trim(),
      code: this.code().trim().toUpperCase(),
      badgeText: this.badgeText().trim() || 'PROMOCJA 🏷️',
      type: this.type(),
      isActive: this.isActive(),
      condition,
      reward
    };

    try {
      if (this.promotionToEdit) {
        await this.promotionService.updatePromotion(this.promotionToEdit.id, payload);
      } else {
        await this.promotionService.createPromotion(payload);
      }
      this.saved.emit();
      this.close.emit();
      this.dialogRef?.close(true);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Wystąpił błąd podczas zapisywania promocji.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
