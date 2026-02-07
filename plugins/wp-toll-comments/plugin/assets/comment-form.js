(() => {
  const config = window.DDNS_TOLL_COMMENTS_CONFIG || null;
  if (!config) {
    return;
  }

  const connectButton = document.getElementById('ddns-toll-connect');
  const payButton = document.getElementById('ddns-toll-pay');
  const statusEl = document.getElementById('ddns-toll-status');
  const walletInput = document.getElementById('ddns-toll-wallet');
  const txInput = document.getElementById('ddns-toll-tx-hash');
  const intentInput = document.getElementById('ddns-toll-intent');

  if (!connectButton || !payButton || !walletInput || !txInput || !intentInput) {
    return;
  }

  let provider = null;
  let signer = null;

  const setStatus = (message) => {
    if (statusEl) {
      statusEl.textContent = message;
    }
  };

  const parseAmount = () => {
    const raw = String(config.tollAmount || '').trim();
    if (!raw) {
      return 0n;
    }
    if (raw.includes('.')) {
      return ethers.parseEther(raw);
    }
    return BigInt(raw);
  };

  const connectWallet = async () => {
    setStatus('Connecting wallet...');
    if (window.EthereumProvider && config.walletConnectProjectId) {
      const wcProvider = await window.EthereumProvider.init({
        projectId: config.walletConnectProjectId,
        chains: [Number(config.chainId)],
        rpcMap: config.rpcUrl ? { [Number(config.chainId)]: config.rpcUrl } : undefined,
        showQrModal: true,
      });
      await wcProvider.connect();
      provider = new ethers.BrowserProvider(wcProvider);
      signer = await provider.getSigner();
    } else if (window.ethereum) {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    } else {
      setStatus('No wallet provider available.');
      return null;
    }

    const address = await signer.getAddress();
    walletInput.value = address;
    setStatus(`Wallet connected: ${address}`);
    return address;
  };

  const payToll = async () => {
    if (config.token !== 'NATIVE') {
      setStatus('Token payments not supported yet.');
      return;
    }

    if (!signer) {
      const address = await connectWallet();
      if (!address) {
        return;
      }
    }

    const amount = parseAmount();
    if (amount <= 0n) {
      setStatus('Invalid toll amount.');
      return;
    }

    const targetAddress = config.escrowContract || config.treasuryAddress;
    if (!targetAddress) {
      setStatus('Escrow contract or treasury address missing.');
      return;
    }

    try {
      let tx;
      if (config.escrowContract) {
        const abi = ['function deposit(bytes32 intentId) payable'];
        const contract = new ethers.Contract(targetAddress, abi, signer);
        const intentId = intentInput.value || '';
        const intentHash = ethers.id(intentId);
        tx = await contract.deposit(intentHash, { value: amount });
      } else {
        tx = await signer.sendTransaction({
          to: targetAddress,
          value: amount,
        });
      }

      txInput.value = tx.hash;
      setStatus(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      if (receipt && receipt.status === 1) {
        setStatus('Payment confirmed. You can submit your comment.');
      } else {
        setStatus('Payment failed.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Payment failed. Please check your wallet and try again.');
    }
  };

  connectButton.addEventListener('click', () => {
    connectWallet().catch((error) => {
      console.error(error);
      setStatus('Wallet connection failed. Please try again.');
    });
  });

  payButton.addEventListener('click', () => {
    payToll().catch((error) => {
      console.error(error);
      setStatus('Payment failed. Please check your wallet and try again.');
    });
  });
})();
