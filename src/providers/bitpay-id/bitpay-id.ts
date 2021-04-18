import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { Logger } from '../../providers/logger/logger';

// providers
import { Device } from '@ionic-native/device';
import * as bitauthService from 'bitauth';
import { Events } from 'ionic-angular';
import { User } from '../../models/user/user.model';
import { AppIdentityProvider } from '../app-identity/app-identity';
import { InAppBrowserProvider } from '../in-app-browser/in-app-browser';
import { Network, PersistenceProvider } from '../persistence/persistence';
import { PlatformProvider } from '../platform/platform';

@Injectable()
export class rothIdProvider {
  private NETWORK: string;
  private roth_API_URL: string;
  private deviceName = 'unknown device';

  constructor(
    private http: HttpClient,
    private appIdentityProvider: AppIdentityProvider,
    private logger: Logger,
    private device: Device,
    private platformProvider: PlatformProvider,
    private persistenceProvider: PersistenceProvider,
    private iab: InAppBrowserProvider,
    private events: Events
  ) {
    this.logger.debug('rothProvider initialized');
    if (this.platformProvider.isElectron) {
      this.deviceName = this.platformProvider.getOS().OSName;
    } else if (this.platformProvider.isCordova) {
      this.deviceName = this.device.model;
    }
  }

  public setNetwork(network: string) {
    this.NETWORK = network;
    this.roth_API_URL =
      this.NETWORK == 'livenet'
        ? 'https://roth.com'
        : 'https://test.roth.com';
    this.logger.log(`roth id provider initialized with ${this.NETWORK}`);
  }

  public getEnvironment() {
    return {
      network: this.NETWORK
    };
  }

  public generatePairingToken(payload, successCallback, errorCallback) {
    const network = Network[this.getEnvironment().network];

    this.appIdentityProvider.getIdentity(network, (err, appIdentity) => {
      if (err) {
        alert(err);
        return errorCallback(err);
      }

      const { secret, code } = payload;

      const params = {
        secret,
        version: 2,
        deviceName: this.deviceName
      };

      if (code) {
        params['code'] = code;
      }

      let json: any = {
        method: 'createToken',
        params
      };

      let dataToSign = JSON.stringify(json['params']);
      let signedData = bitauthService.sign(dataToSign, appIdentity.priv);

      bitauthService.verifySignature(
        dataToSign,
        appIdentity.pub,
        signedData,

        async () => {
          json['params'].signature = bitauthService.sign(
            dataToSign,
            appIdentity.priv
          );
          json['params'].pubkey = appIdentity.pub;
          json['params'] = JSON.stringify(json.params);

          const url = `${this.roth_API_URL}/api/v2/`;
          let headers = new HttpHeaders().set(
            'content-type',
            'application/json'
          );

          try {
            const token: { data?: string } = await this.http
              // @ts-ignore
              .post(url, json, { headers })
              .toPromise();

            json = {
              method: 'getBasicInfo',
              token: token.data
            };

            dataToSign = `${url}${token.data}${JSON.stringify(json)}`;

            signedData = bitauthService.sign(dataToSign, appIdentity.priv);

            headers = headers.append('x-identity', appIdentity.pub);
            headers = headers.append('x-signature', signedData);

            const user: User = await this.http
              .post(`${url}${token.data}`, json, { headers })
              .toPromise();

            if (user) {
              if (user.error) {
                errorCallback(user.error);
                return;
              }

              this.logger.debug('rothID: successfully paired');
              const { data } = user;
              const {
                email,
                familyName,
                givenName,
                experiments,
                incentiveLevel,
                incentiveLevelId
              } = data;

              if (experiments && experiments.includes('NADebitCard')) {
                this.persistenceProvider.setCardExperimentFlag('enabled');
                this.events.publish('experimentUpdateStart');
              }

              await Promise.all([
                this.persistenceProvider.setrothIdPairingToken(
                  network,
                  token.data
                ),
                this.persistenceProvider.setrothIdUserInfo(network, data),
                this.persistenceProvider.setrothAccount(network, {
                  email,
                  token: token.data,
                  familyName: familyName || '',
                  givenName: givenName || '',
                  incentiveLevel,
                  incentiveLevelId
                })
              ]);

              successCallback(data);
            }
          } catch (err) {
            alert(JSON.stringify(err));
            errorCallback(err);
          }
        },
        err => {
          errorCallback(err);
        }
      );
    });
  }

  public async apiCall(
    method: string,
    params: any = {},
    userShopperToken?: string
  ) {
    const url = `${this.roth_API_URL}/api/v2/`;
    let token =
      userShopperToken ||
      (await this.persistenceProvider.getrothIdPairingToken(
        Network[this.NETWORK]
      ));
    const json = {
      method,
      params: JSON.stringify(params),
      token
    };
    const dataToSign = `${url}${token}${JSON.stringify(json)}`;
    const appIdentity = (await this.getAppIdentity()) as any;
    const signedData = bitauthService.sign(dataToSign, appIdentity.priv);

    let headers = new HttpHeaders().set('content-type', 'application/json');
    headers = headers.append('x-identity', appIdentity.pub);
    headers = headers.append('x-signature', signedData);

    const res: any = await this.http
      .post(`${url}${token}`, json, { headers })
      .toPromise();

    if (res && res.error) {
      throw new Error(res.error);
    }
    return (res && res.data) || res;
  }

  public async refreshUserInfo() {
    this.logger.debug('Refreshing user info');
    const userInfo = await this.apiCall('getBasicInfo');
    const network = Network[this.getEnvironment().network];
    await this.persistenceProvider.setrothIdUserInfo(network, userInfo);
  }

  public async unlockInvoice(invoiceId: string): Promise<string> {
    const isPaired = !!(await this.persistenceProvider.getrothIdPairingToken(
      Network[this.NETWORK]
    ));
    if (!isPaired) return 'pairingRequired';

    const tokens = await this.apiCall('getProductTokens');
    const { token } = tokens.find(t => t.facade === 'userShopper');
    if (!token) return 'userShopperNotFound';

    const { meetsRequiredTier } = await this.apiCall(
      'unlockInvoice',
      { invoiceId },
      token
    );
    if (!meetsRequiredTier) return 'tierNotMet';

    return 'unlockSuccess';
  }

  getAppIdentity(): Promise<{ pub: string; priv: string }> {
    const network = Network[this.getEnvironment().network];
    return new Promise((resolve, reject) => {
      this.appIdentityProvider.getIdentity(network, (err, appIdentity) => {
        if (err) {
          return reject(err);
        }
        resolve(appIdentity);
      });
    });
  }

  public async disconnectrothID(successCallback, errorCallback) {
    const network = Network[this.getEnvironment().network];

    // @ts-ignore
    const user: any = await this.persistenceProvider.getrothIdUserInfo(
      network
    );

    try {
      await Promise.all([
        this.persistenceProvider.removerothIdPairingToken(network),
        this.persistenceProvider.removerothIdUserInfo(network),
        this.persistenceProvider.removerothAccountV2(network)
      ]);
      this.iab.refs.card.executeScript(
        {
          code: `window.postMessage(${JSON.stringify({
            message: 'rothIdDisconnected'
          })}, '*')`
        },
        () => {
          successCallback();
        }
      );
    } catch (err) {
      errorCallback(err);
    }
  }
}
