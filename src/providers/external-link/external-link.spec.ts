import { TestUtils } from '../../test';
import { ExternalLinkProvider } from './external-link';

describe('Provider: External Link Provider', () => {
  let externalLinkProvider: ExternalLinkProvider;
  let url = 'https://github.com/roth/roth/releases/latest';

  beforeEach(() => {
    const testBed = TestUtils.configureProviderTestingModule();
    externalLinkProvider = testBed.get(ExternalLinkProvider);
  });

  describe('open', () => {
    it('should open browser without options', () => {
      externalLinkProvider
        .open(url)
        .then(() => {
          expect().nothing();
        })
        .catch(err => expect(err).toBeNull);
    });
  });
});
