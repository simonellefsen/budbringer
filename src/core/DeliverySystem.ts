import * as THREE from 'three';
import { Game } from './Game';

export interface Delivery {
  id: number;
  from: string;
  to: string;
  letterContent: string;
  completed: boolean;
}

export interface DeliveryChain {
  deliveries: Delivery[];
  currentIndex: number;
}

export class DeliverySystem {
  private game: Game;
  public chain: DeliveryChain;
  public currentDelivery: Delivery | null = null;
  public hasLetter: boolean = false;
  public completedCount: number = 0;
  public totalDeliveries: number = 5;
  public gameComplete: boolean = false;

  constructor(game: Game) {
    this.game = game;
    
    this.chain = {
      deliveries: [
        {
          id: 1,
          from: 'Postmaster Maple',
          to: 'Fisher Finn',
          letterContent: "Finn - Your fishing license renewal is approved. Remember, no fishing near the shrine during prayer hours! - Town Hall",
          completed: false
        },
        {
          id: 2,
          from: 'Fisher Finn',
          to: 'Hermit Hazel',
          letterContent: "Dear Hazel, Caught that big silver one you wanted to paint. Come by the pier when you can. Still tastes better fresh. - Finn",
          completed: false
        },
        {
          id: 3,
          from: 'Hermit Hazel',
          to: 'Keeper Kai',
          letterContent: "Kai - I finished the mural restoration in my cave. The old star maps are beautiful. You should see them before the rains. - H",
          completed: false
        },
        {
          id: 4,
          from: 'Keeper Kai',
          to: 'Baker Brie',
          letterContent: "Brie, The shrine lanterns need oil for the solstice festival. Can you spare some of the good stuff from your kitchen? Blessings. - Kai",
          completed: false
        },
        {
          id: 5,
          from: 'Baker Brie',
          to: 'Postmaster Maple',
          letterContent: "Maple! Here's the recipe you asked for - Gran's honey bread. The secret is patience and a warm heart. Thank the courier for me! - Brie",
          completed: false
        }
      ],
      currentIndex: 0
    };
  }

  public startFirstDelivery(): void {
    this.setCurrentDelivery(0);
  }

  private setCurrentDelivery(index: number): void {
    if (index >= this.chain.deliveries.length) {
      this.gameComplete = true;
      this.currentDelivery = null;
      this.hasLetter = false;
      this.game.dialogueSystem.showMessage(
        "All deliveries complete!",
        "You've delivered all the letters. The little planet feels a bit more connected now. Thanks for playing budbringer!"
      );
      return;
    }
    
    this.chain.currentIndex = index;
    this.currentDelivery = this.chain.deliveries[index];
    this.hasLetter = false;
  }

  public canPickupFrom(npcName: string): boolean {
    if (!this.currentDelivery || this.hasLetter || this.gameComplete) return false;
    return this.currentDelivery.from === npcName;
  }

  public canDeliverTo(npcName: string): boolean {
    if (!this.currentDelivery || !this.hasLetter || this.gameComplete) return false;
    return this.currentDelivery.to === npcName;
  }

  public pickupLetter(): string {
    if (!this.currentDelivery) return '';
    this.hasLetter = true;
    this.game.audioManager.playPickup();
    return `Take this letter to ${this.currentDelivery.to}. They're waiting for it!`;
  }

  public deliverLetter(): string {
    if (!this.currentDelivery) return '';
    
    this.currentDelivery.completed = true;
    this.completedCount++;
    this.game.audioManager.playDeliver();
    
    const response = this.getDeliveryResponse(this.currentDelivery.to);
    
    setTimeout(() => {
      this.setCurrentDelivery(this.chain.currentIndex + 1);
    }, 100);
    
    return response;
  }

  private getDeliveryResponse(npcName: string): string {
    const responses: Record<string, string> = {
      'Fisher Finn': "My fishing license! Finally. Tell Maple I'll bring her some fresh catch next week.",
      'Hermit Hazel': "A letter for me? How unexpected. The outside world remembers old Hazel, it seems.",
      'Keeper Kai': "Hazel finished the mural? The ancestors will be pleased. Thank you, little courier.",
      'Baker Brie': "Kai needs oil for the lanterns? Of course! The solstice won't be the same without them.",
      'Postmaster Maple': "The honey bread recipe! And you delivered every letter today. You've got the makings of a true budbringer."
    };
    return responses[npcName] || "Thank you for the delivery!";
  }

  public getCurrentRecipient(): string | null {
    if (!this.currentDelivery || !this.hasLetter) return null;
    return this.currentDelivery.to;
  }

  public getRecipientPosition(): THREE.Vector3 | null {
    const recipientName = this.getCurrentRecipient();
    if (!recipientName) return null;
    
    const npc = this.game.npcManager.getNPCByName(recipientName);
    return npc ? npc.position.clone() : null;
  }

  public update(): void {
  }
}
