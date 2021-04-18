import { Component, Input, OnInit } from '@angular/core';
import { Events, NavController } from 'ionic-angular';
// Providers
import { AppProvider, IABCardProvider } from '../../../../providers';

// Pages
import { animate, style, transition, trigger } from '@angular/animations';
import {
  Network,
  PersistenceProvider
} from '../../../../providers/persistence/persistence';
import { rothCardIntroPage } from '../roth-card-intro/roth-card-intro';
import { PhaseOneCardIntro } from '../roth-card-phases/phase-one/phase-one-intro-page/phase-one-intro-page';

@Component({
  selector: 'roth-card-home',
  templateUrl: 'roth-card-home.html',
  animations: [
    trigger('fadeUp', [
      transition(':enter', [
        style({
          transform: 'translateY(5px)',
          opacity: 0
        }),
        animate('300ms')
      ])
    ]),
    trigger('fade', [
      transition(':enter', [
        style({
          opacity: 0
        }),
        animate('300ms')
      ])
    ]),
    trigger('tileSlideIn', [
      transition(':enter', [
        style({
          transform: 'translateX(10px)',
          opacity: 0
        }),
        animate('300ms ease')
      ])
    ])
  ]
})
export class rothCardHome implements OnInit {
  public appName: string;
  public disableAddCard = true;
  public isFetching: boolean;
  public ready: boolean;
  public alreadyOnWaitList: boolean;
  @Input() showrothCardGetStarted: boolean;
  @Input() rothCardItems: any;
  @Input() cardExperimentEnabled: boolean;
  @Input() waitList: boolean;
  @Input() hasCards: boolean;
  @Input() network: Network;
  @Input() initialized: boolean;

  constructor(
    private appProvider: AppProvider,
    private navCtrl: NavController,
    private iabCardProvider: IABCardProvider,
    private persistenceProvider: PersistenceProvider,
    private events: Events
  ) {
    this.persistenceProvider.getWaitingListStatus().then(status => {
      this.alreadyOnWaitList = !!status;
    });

    this.events.subscribe('reachedCardLimit', () => {
      this.disableAddCard = true;
    });
  }

  ngOnInit() {
    this.appName = this.appProvider.info.userVisibleName;
    this.disableAddCard =
      this.rothCardItems &&
      this.rothCardItems.find(c => c.provider === 'galileo');
  }

  public goTorothCardIntroPage() {
    this.navCtrl.push(this.waitList ? PhaseOneCardIntro : rothCardIntroPage);
  }

  public trackBy(index) {
    return index;
  }

  public async goToCard(cardId) {
    this.iabCardProvider.loadingWrapper(async () => {
      const token = await this.persistenceProvider.getrothIdPairingToken(
        this.network
      );
      const email = this.rothCardItems[0].email;

      const message = !token
        ? `loadDashboard?${cardId}&${email}`
        : `loadDashboard?${cardId}`;

      this.iabCardProvider.show();
      setTimeout(() => {
        this.iabCardProvider.sendMessage(
          {
            message
          },
          () => {}
        );
      });
    });
  }
}
