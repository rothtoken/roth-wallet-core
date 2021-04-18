import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import * as _ from 'lodash';

// native
import { Device } from '@ionic-native/device';

// providers
import { AppIdentityProvider } from '../app-identity/app-identity';
import { rothProvider } from '../roth/roth';
import { Logger } from '../logger/logger';
import { OnGoingProcessProvider } from '../on-going-process/on-going-process';
import { PersistenceProvider } from '../persistence/persistence';
import { PlatformProvider } from '../platform/platform';
import { PopupProvider } from '../popup/popup';
import { ReplaceParametersProvider } from '../replace-parameters/replace-parameters';

@Injectable()
export class rothAccountProvider {
  /*
   * Pair this app with the roth server using the specified pairing data.
   * An app identity will be created if one does not already exist.
   * Pairing data is provided by an input URI provided by the roth server.
   *
   * pairData - data needed to complete the pairing process
   * {
   *   secret: shared pairing secret
   *   email: email address associated with roth account
   *   otp: two-factor one-time use password
   * }
   *
   * pairingReason - text string to be embedded into popup message.  If `null` then the reason
   * message is not shown to the UI.
   *   "To {{reason}} you must pair this app with your roth account ({{email}})."
   *
   * cb - callback after completion
   *   callback(err, paired, apiContext)
   *
   *   err - something unexpected happened which prevented the pairing
   *
   *   paired - boolean indicating whether the pairing was compledted by the user
   *
   *   apiContext - the context needed for making future api calls
   *   {
   *     token: api token for use in future calls
   *     pairData: the input pair data
   *     appIdentity: the identity of this app
   *   }
   */

  constructor(
    private platformProvider: PlatformProvider,
    private replaceParametersProvider: ReplaceParametersProvider,
    private rothProvider: rothProvider,
    private logger: Logger,
    private onGoingProcessProvider: OnGoingProcessProvider,
    private popupProvider: PopupProvider,
    private persistenceProvider: PersistenceProvider,
    private appIdentityProvider: AppIdentityProvider,
    private device: Device,
    private translate: TranslateService
  ) {
    this.logger.debug('rothAccountProvider initialized');
  }

  public pair(
    pairData,
    pairingReason: string,
    cb: (err: string, paired?: boolean, apiContext?) => any
  ) {
    this.checkOtp(pairData, otp => {
      pairData.otp = otp;
      let deviceName = 'Unknown device';
      if (this.platformProvider.isElectron) {
        deviceName = this.platformProvider.getOS().OSName;
      } else if (this.platformProvider.isCordova) {
        deviceName = this.device.model;
      }
      let json = {
        method: 'createToken',
        params: {
          secret: pairData.secret,
          version: 2,
          deviceName,
          code: pairData.otp
        }
      };

      this.onGoingProcessProvider.set('fetchingrothAccount');
      this.rothProvider.postAuth(
        json,
        data => {
          if (data && data.error) {
            this.onGoingProcessProvider.clear();
            return cb(data.error);
          }
          let apiContext = {
            token: data.data,
            pairData,
            appIdentity: data.appIdentity
          };
          this.logger.info('roth service BitAuth create token: SUCCESS');

          this.fetchBasicInfo(apiContext, (err, basicInfo) => {
            this.onGoingProcessProvider.clear();
            if (err) return cb(err);
            let title = this.translate.instant('Add roth Account?');
            let msg;

            if (pairingReason) {
              let reason = pairingReason;
              let email = pairData.email;

              msg = this.replaceParametersProvider.replace(
                this.translate.instant(
                  'To {{reason}} you must first add your roth account - {{email}}'
                ),
                { reason, email }
              );
            } else {
              let email = pairData.email;
              msg = this.replaceParametersProvider.replace(
                this.translate.instant('Add this roth account ({{email}})?'),
                { email }
              );
            }

            let ok = this.translate.instant('Add account');
            let cancel = this.translate.instant('Go Back');
            this.popupProvider
              .ionicConfirm(title, msg, ok, cancel)
              .then(res => {
                if (res) {
                  let acctData = {
                    token: apiContext.token,
                    email: pairData.email,
                    givenName: basicInfo.givenName,
                    familyName: basicInfo.familyName
                  };
                  this.setrothAccount(acctData);
                  return cb(null, true, apiContext);
                } else {
                  this.logger.info('User cancelled roth pairing process');
                  return cb(null, false);
                }
              });
          });
        },
        data => {
          return cb(
            this._setError('roth service BitAuth create token: ERROR ', data)
          );
        }
      );
    });
  }

  private checkOtp(pairData, cb: (otp?) => any) {
    if (pairData.otp) {
      let msg = this.translate.instant(
        'Enter Two Factor for your roth account'
      );
      this.popupProvider.ionicPrompt(null, msg, null).then(res => {
        cb(res);
      });
    } else {
      cb();
    }
  }

  private fetchBasicInfo(apiContext, cb: (err, basicInfo?) => any) {
    let json = {
      method: 'getBasicInfo'
    };
    // Get basic account information
    this.rothProvider.post(
      '/api/v2/' + apiContext.token,
      json,
      data => {
        if (data && data.error) return cb(data.error);
        this.logger.info('roth Account Get Basic Info: SUCCESS');
        return cb(null, data.data);
      },
      data => {
        return cb(this._setError('roth Account Error: Get Basic Info', data));
      }
    );
  }

  // Returns account objects as stored.
  public getAccountsAsStored(cb: (err, accounts) => any) {
    this.persistenceProvider
      .getrothAccounts(this.rothProvider.getEnvironment().network)
      .then(accounts => {
        return cb(null, accounts);
      })
      .catch(err => {
        return cb(err, []);
      });
  }

  // Returns an array where each element represents an account including all information required for fetching data
  // from the server for each account (apiContext).
  public getAccounts(cb: (err, accounts?) => any) {
    this.getAccountsAsStored((err, accounts) => {
      if (err || _.isEmpty(accounts)) {
        return cb(err, []);
      }
      this.appIdentityProvider.getIdentity(
        this.rothProvider.getEnvironment().network,
        (err, appIdentity) => {
          if (err) {
            return cb(err);
          }

          let accountsArray = [];
          _.forEach(Object.keys(accounts), key => {
            accounts[key].cards = accounts[key].cards;
            accounts[key].email = key;
            accounts[key].givenName = accounts[key].givenName || '';
            accounts[key].familyName = accounts[key].familyName || '';
            accounts[key].apiContext = {
              token: accounts[key].token,
              pairData: {
                email: key
              },
              appIdentity
            };

            accountsArray.push(accounts[key]);
          });
          return cb(null, accountsArray);
        }
      );
    });
  }

  private setrothAccount(account) {
    this.persistenceProvider.setrothAccount(
      this.rothProvider.getEnvironment().network,
      account
    );
  }

  public removeAccount(email: string, cb: () => any) {
    this.persistenceProvider
      .removerothAccount(this.rothProvider.getEnvironment().network, email)
      .then(() => {
        return cb();
      });
  }

  private _setError(msg: string, e): string {
    this.logger.error(msg);
    let error = e && e.data && e.data.error ? e.data.error : msg;
    return error;
  }
}
