// / cli/internal/x402/buyer.go — x402 payment-aware HTTP client
// / Handles 402 challenge/response automatically for ticket purchases.
package x402

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	x402core "github.com/coinbase/x402/go"
	x402http "github.com/coinbase/x402/go/http"
	evmexact "github.com/coinbase/x402/go/mechanisms/evm/exact/client"
	evmsigners "github.com/coinbase/x402/go/signers/evm"
)

type BuyTicketResponse struct {
	Success   bool   `json:"success"`
	TicketID  string `json:"ticketId"`
	EventID   string `json:"eventId"`
	Buyer     string `json:"buyer"`
	Message   string `json:"message"`
	TxHash    string `json:"txHash"`
	Timestamp string `json:"timestamp"`
}

func BuyTicket(baseURL, eventID, buyerAddress, agentID, privateKey string) (*BuyTicketResponse, error) {
	signer, err := evmsigners.NewClientSignerFromPrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key for x402 signer: %w", err)
	}

	x402Client := x402core.Newx402Client().Register(
		"eip155:*",
		evmexact.NewExactEvmScheme(signer),
	)

	httpClient := x402http.WrapHTTPClientWithPayment(
		http.DefaultClient,
		x402http.Newx402HTTPClient(x402Client),
	)

	endpoint := strings.TrimRight(baseURL, "/")
	endpoint += "/api/events/" + url.PathEscape(eventID) + "/buy"
	query := url.Values{}
	query.Set("buyer", buyerAddress)
	if agentID != "" {
		query.Set("agent", agentID)
	}
	endpoint += "?" + query.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-buyer-address", buyerAddress)
	if agentID != "" {
		req.Header.Set("x-agent-id", agentID)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("x402 request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result BuyTicketResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid API response: %s", string(body))
	}

	if resp.StatusCode >= 400 || !result.Success {
		return nil, fmt.Errorf("ticket purchase failed (%d): %s", resp.StatusCode, result.Message)
	}

	return &result, nil
}
