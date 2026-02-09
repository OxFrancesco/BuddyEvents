/// cli/internal/api/client.go — HTTP client for BuddyEvents API
/// Calls Next.js API routes and Convex functions
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{},
	}
}

// ===== Events =====

func (c *Client) ListEvents(status string) (interface{}, error) {
	url := c.baseURL + "/api/events"
	if status != "" {
		url += "?status=" + status
	}
	return c.get(url)
}

type CreateEventRequest struct {
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	StartTime      int64   `json:"startTime"`
	EndTime        int64   `json:"endTime"`
	Price          float64 `json:"price"`
	MaxTickets     int     `json:"maxTickets"`
	TeamID         string  `json:"teamId"`
	Location       string  `json:"location"`
	CreatorAddress string  `json:"creatorAddress"`
}

func (c *Client) CreateEvent(req CreateEventRequest) (string, error) {
	result, err := c.post(c.baseURL+"/api/events", req)
	if err != nil {
		return "", err
	}
	if m, ok := result.(map[string]interface{}); ok {
		if id, ok := m["eventId"].(string); ok {
			return id, nil
		}
	}
	return fmt.Sprintf("%v", result), nil
}

func (c *Client) CancelEvent(eventID string) error {
	// Use the Convex-style API
	_, err := c.post(c.baseURL+"/api/events", map[string]interface{}{
		"action":  "cancel",
		"eventId": eventID,
	})
	return err
}

// ===== Tickets =====

func (c *Client) ListTicketsByEvent(eventID string) (interface{}, error) {
	return c.get(c.baseURL + "/api/events?tickets=true&eventId=" + eventID)
}

func (c *Client) ListTicketsByBuyer(buyerAddress string) (interface{}, error) {
	return c.get(c.baseURL + "/api/events?tickets=true&buyer=" + buyerAddress)
}

func (c *Client) BuyTicket(eventID, buyerAddress, agentID string) (string, error) {
	url := fmt.Sprintf("%s/api/events/%s/buy?buyer=%s", c.baseURL, eventID, buyerAddress)
	if agentID != "" {
		url += "&agent=" + agentID
	}

	result, err := c.get(url)
	if err != nil {
		return "", err
	}
	if m, ok := result.(map[string]interface{}); ok {
		if id, ok := m["ticketId"].(string); ok {
			return id, nil
		}
	}
	return fmt.Sprintf("%v", result), nil
}

// ===== Teams =====

func (c *Client) CreateTeam(name, description, walletAddress string, members []string) (string, error) {
	result, err := c.post(c.baseURL+"/api/teams", map[string]interface{}{
		"name":          name,
		"description":   description,
		"walletAddress": walletAddress,
		"members":       members,
	})
	if err != nil {
		return "", err
	}
	if m, ok := result.(map[string]interface{}); ok {
		if id, ok := m["teamId"].(string); ok {
			return id, nil
		}
	}
	return fmt.Sprintf("%v", result), nil
}

// ===== Agents =====

func (c *Client) RegisterAgent(name, walletAddress, ownerAddress string) (string, error) {
	result, err := c.post(c.baseURL+"/api/agent", map[string]interface{}{
		"name":          name,
		"walletAddress": walletAddress,
		"ownerAddress":  ownerAddress,
	})
	if err != nil {
		return "", err
	}
	if m, ok := result.(map[string]interface{}); ok {
		if id, ok := m["agentId"].(string); ok {
			return id, nil
		}
	}
	return fmt.Sprintf("%v", result), nil
}

func (c *Client) GetAgent(walletAddress string) (interface{}, error) {
	return c.get(c.baseURL + "/api/agent?wallet=" + walletAddress)
}

// ===== HTTP helpers =====

func (c *Client) get(url string) (interface{}, error) {
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	return c.parseResponse(resp)
}

func (c *Client) post(url string, body interface{}) (interface{}, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	return c.parseResponse(resp)
}

func (c *Client) parseResponse(resp *http.Response) (interface{}, error) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(body))
	}

	var result interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return string(body), nil
	}
	return result, nil
}
