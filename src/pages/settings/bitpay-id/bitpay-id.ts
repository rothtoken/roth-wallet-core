import { ChangeDetectorRef, Component } from '@angular/core';

// providers
import { TranslateService } from '@ngx-translate/core';
import { Events, NavController, NavParams } from 'ionic-angular';
import {
  ActionSheetProvider,
  rothIdProvider,
  Logger,
  PersistenceProvider,
  PopupProvider
} from '../../../providers';
import { InAppBrowserProvider } from '../../../providers/in-app-browser/in-app-browser';

@Component({
  selector: 'roth-id',
  templateUrl: 'roth-id.html'
})
export class rothIdPage {
  public userBasicInfo;
  public network;
  public originalrothIdSettings: string;
  public rothIdSettings = this.getDefaultrothIdSettings();

  constructor(
    private events: Events,
    private logger: Logger,
    private navParams: NavParams,
    private rothIdProvider: rothIdProvider,
    private navCtrl: NavController,
    private popupProvider: PopupProvider,
    private persistenceProvider: PersistenceProvider,
    private actionSheetProvider: ActionSheetProvider,
    private changeDetectorRef: ChangeDetectorRef,
    private translate: TranslateService,
    private iab: InAppBrowserProvider
  ) {}

  async ionViewDidLoad() {
    this.userBasicInfo = this.navParams.data;
    this.changeDetectorRef.detectChanges();
    this.network = this.rothIdProvider.getEnvironment().network;
    this.rothIdSettings =
      (await this.persistenceProvider.getrothIdSettings(this.network)) ||
      this.getDefaultrothIdSettings();
    this.originalrothIdSettings = JSON.stringify(this.rothIdSettings);
    this.logger.info('Loaded: rothID page');
  }

  ionViewWillLeave() {
    const settingsChanged =
      this.originalrothIdSettings !== JSON.stringify(this.rothIdSettings);
    if (settingsChanged) {
      this.events.publish('rothId/SettingsChanged');
    }
  }

  getDefaultrothIdSettings() {
    return {
      syncGiftCardPurchases: false
    };
  }

  async onSettingsChange() {
    await this.persistenceProvider.setrothIdSettings(
      this.network,
      this.rothIdSettings
    );
  }

  disconnectrothID() {
    this.popupProvider
      .ionicConfirm(
        this.translate.instant('Disconnect roth ID'),
        this.translate.instant(
          'Are you sure you would like to disconnect your roth ID?'
        )
      )
      .then(res => {
        if (res) {
          this.rothIdProvider.disconnectrothID(
            () => {
              const infoSheet = this.actionSheetProvider.createInfoSheet(
                'in-app-notification',
                {
                  title: 'roth ID',
                  body: this.translate.instant(
                    'roth ID successfully disconnected.'
                  )
                }
              );
              this.iab.refs.card.executeScript(
                {
                  code: `window.postMessage(${JSON.stringify({
                    message: 'rothIdDisconnected'
                  })}, '*')`
                },
                () => {
                  infoSheet.present();
                  setTimeout(() => {
                    this.navCtrl.popToRoot();
                  }, 400);
                }
              );
              this.events.publish('rothId/Disconnected');
              this.events.publish('CardAdvertisementUpdate', {
                status: 'disconnected'
              });
            },
            err => {
              this.logger.log(err);
            }
          );
        }
      });
  }
}
