/// cli/internal/config/config.go — CLI configuration management
/// Stores API URLs, wallet info, contract addresses
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	APIURL          string `json:"api_url"`
	ConvexURL       string `json:"convex_url"`
	MonadRPC        string `json:"monad_rpc"`
	WalletAddress   string `json:"wallet_address"`
	PrivateKey      string `json:"private_key"`
	ContractAddress string `json:"contract_address"`
	USDCAddress     string `json:"usdc_address"`
}

func Default() *Config {
	return &Config{
		APIURL:          "http://localhost:3000",
		ConvexURL:       "",
		MonadRPC:        "https://testnet-rpc.monad.xyz",
		WalletAddress:   "",
		PrivateKey:      "",
		ContractAddress: "",
		USDCAddress:     "0x534b2f3A21130d7a60830c2Df862319e593943A3",
	}
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".buddyevents")
}

func configPath(custom string) string {
	if custom != "" {
		return custom
	}
	return filepath.Join(configDir(), "config.json")
}

func Load(custom string) (*Config, error) {
	path := configPath(custom)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := Default()
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func Save(cfg *Config, custom string) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	path := configPath(custom)
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
