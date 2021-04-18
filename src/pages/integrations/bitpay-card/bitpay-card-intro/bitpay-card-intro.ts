import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ActionSheetController, NavController, NavParams } from 'ionic-angular';

import * as _ from 'lodash';

// providers
// pages
import { IABCardProvider, PersistenceProvider } from '../../../../providers';
import { rothAccountProvider } from '../../../../providers/roth-account/roth-account';
import { rothCardProvider } from '../../../../providers/roth-card/roth-card';
import { ExternalLinkProvider } from '../../../../providers/external-link/external-link';
import { Network } from '../../../../providers/persistence/persistence';
import { PopupProvider } from '../../../../providers/popup/popup';
import { ScanProvider } from '../../../../providers/scan/scan';
import { ThemeProvider } from '../../../../providers/theme/theme';
import { rothCardPage } from '../roth-card';

@Component({
  selector: 'page-roth-card-intro',
  templateUrl: 'roth-card-intro.html',
  providers: [ScanProvider]
})
export class rothCardIntroPage {
  private scannerHasPermission: boolean;
  public accounts;
  public cardExperimentEnabled: boolean;
  public ready: boolean;
  public rothIdConnected: boolean;
  constructor(
    private translate: TranslateService,
    private actionSheetCtrl: ActionSheetController,
    private navParams: NavParams,
    private rothAccountProvider: rothAccountProvider,
    private popupProvider: PopupProvider,
    private rothCardProvider: rothCardProvider,
    private navCtrl: NavController,
    private externalLinkProvider: ExternalLinkProvider,
    private persistenceProvider: PersistenceProvider,
    private iabCardProvider: IABCardProvider,
    private scanProvider: ScanProvider,
    private themeProvider: ThemeProvider
  ) {
    this.scannerHasPermission = false;
    this.updateCapabilities();
    this.persistenceProvider.getCardExperimentFlag().then(status => {
      this.cardExperimentEnabled = status === 'enabled';
    });
  }

  ionViewWillEnter() {
    if (this.navParams.data.secret) {
      let pairData = {
        secret: this.navParams.data.secret,
        email: this.navParams.data.email,
        otp: this.navParams.data.otp
      };
      let pairingReason = this.translate.instant(
        'add your roth Visa card(s)'
      );
      this.rothAccountProvider.pair(
        pairData,
        pairingReason,
        (err: string, paired: boolean, apiContext) => {
          if (err) {
            this.popupProvider.ionicAlert(
              this.translate.instant('Error pairing roth Account'),
              err
            );
            return;
          }
          if (paired) {
            this.rothCardProvider.sync(apiContext, (err, cards) => {
              if (err) {
                this.popupProvider.ionicAlert(
                  this.translate.instant('Error updating Debit Cards'),
                  err
                );
                return;
              }

              // Fixes mobile navigation
              setTimeout(() => {
                if (cards[0]) {
                  this.navCtrl
                    .push(
                      rothCardPage,
                      { id: cards[0].id },
                      { animate: false }
                    )
                    .then(() => {
                      let previousView = this.navCtrl.getPrevious();
                      this.navCtrl.removeView(previousView);
                    });
                }
              }, 200);
            });
          }
        }
      );
    }

    this.rothAccountProvider.getAccounts((err, accounts) => {
      if (err) {
        this.popupProvider.ionicAlert(this.translate.instant('Error'), err);
        return;
      }
      this.accounts = accounts;
    });

    if (!this.scannerHasPermission) {
      this.authorizeCamera();
    }
  }

  ionViewDidEnter() {
    this.persistenceProvider
      .getrothIdPairingToken(Network.livenet)
      .then(token => (this.rothIdConnected = !!token));

    this.iabCardProvider.updateWalletStatus();
    this.rothCardProvider.logEvent('legacycard_view_setup', {});
    this.ready = true;
  }

  private updateCapabilities(): void {
    const capabilities = this.scanProvider.getCapabilities();
    this.scannerHasPermission = capabilities.hasPermission;
  }

  private authorizeCamera(): void {
    this.scanProvider
      .initialize() // prompt for authorization by initializing scanner
      .then(() => this.scanProvider.pausePreview()) // release camera resources from scanner
      .then(() => this.updateCapabilities()); // update component state
  }

  public openExchangeRates() {
    let url = 'https://roth.com/exchange-rates';
    this.externalLinkProvider.open(url);
  }

  public rothCardInfo() {
    let url = 'https://roth.com/visa/faq';
    this.externalLinkProvider.open(url);
  }

  public async orderrothCard(path?: 'login' | 'createAccount') {
    let url = `https://roth.com/wallet-card?context=${path}`;

    if (this.themeProvider.isDarkModeEnabled()) {
      url += '&darkMode=true';
    }

    if (this.rothIdConnected) {
      const user = await this.persistenceProvider.getrothIdUserInfo(
        Network.livenet
      );
      url += `&email=${user.email}`;
    }

    this.iabCardProvider.loadingWrapper(() => {
      this.externalLinkProvider.open(url);
      setTimeout(() => {
        this.navCtrl.pop();
      }, 300);
    });
  }

  public connectrothCard() {
    this.rothCardProvider.logEvent('legacycard_connect', {});
    if (this.accounts.length == 0) {
      this.startPairrothAccount();
    } else {
      this.showAccountSelector();
    }
  }

  private startPairrothAccount() {
    this.navCtrl.popToRoot({ animate: false }); // Back to Root
    let url = 'https://roth.com/visa/dashboard/add-to-roth-wallet-confirm';
    this.externalLinkProvider.open(url);
  }

  private showAccountSelector() {
    let options = [];

    _.forEach(this.accounts, account => {
      options.push({
        text:
          (account.givenName || account.familyName) +
          ' (' +
          account.email +
          ')',
        handler: () => {
          this.onAccountSelect(account);
        }
      });
    });

    // Add account
    options.push({
      text: this.translate.instant('Add account'),
      handler: () => {
        this.onAccountSelect();
      }
    });

    // Cancel
    options.push({
      text: this.translate.instant('Cancel'),
      role: 'cancel'
    });

    let actionSheet = this.actionSheetCtrl.create({
      title: this.translate.instant('From roth account'),
      buttons: options
    });
    actionSheet.present();
  }

  private onAccountSelect(account?): void {
    if (_.isUndefined(account)) {
      this.startPairrothAccount();
    } else {
      this.rothCardProvider.sync(account.apiContext, err => {
        if (err) {
          this.popupProvider.ionicAlert(this.translate.instant('Error'), err);
          return;
        }
        this.navCtrl.pop();
      });
    }
  }
}
