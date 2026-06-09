#!/bin/bash
# Test script for JANET Family Graph compliance

echo "🧪 JANET Family Graph Integration Tests"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Wait for server
echo -e "${BLUE}⏳ Starting server...${NC}"
npm start &
SERVER_PID=$!
sleep 3

# Test function
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4

    echo -e "${BLUE}Testing: $description${NC}"
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s "$endpoint")
    else
        response=$(curl -s -X "$method" -H "Content-Type: application/json" -d "$data" "$endpoint")
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Success${NC}"
        echo "Response: $(echo $response | jq . 2>/dev/null || echo $response)"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
    echo ""
}

# Run tests
BASE_URL="http://localhost:8080/api"

# 1. Health check
test_endpoint "GET" "$BASE_URL/health" "" "Health Check"

# 2. System info
test_endpoint "GET" "$BASE_URL/info" "" "System Info"

# 3. Lattice properties
test_endpoint "GET" "$BASE_URL/lattice/properties" "" "Lattice Properties"

# 4. Get all lattice nodes (count)
test_endpoint "GET" "$BASE_URL/lattice/nodes" "" "All Lattice Nodes"

# 5. Get specific node
test_endpoint "GET" "$BASE_URL/lattice/node/3/26" "" "Specific Lattice Node (Band 3, Type 26)"

# 6. Start chat session
test_endpoint "POST" "$BASE_URL/chat/start" \
  '{"chatKey": "testroom", "userName": "alice", "band": 3, "relType": 26}' \
  "Start Chat Session"

# 7. Create user node in graph
test_endpoint "POST" "$BASE_URL/graph/node" \
  '{"chatKey": "testroom", "entityId": "user-alice", "band": 3, "relType": 26, "metadata": {"nodeType": "PERSON"}}' \
  "Create User Node in Family Graph"

# 8. Create second user node
test_endpoint "POST" "$BASE_URL/graph/node" \
  '{"chatKey": "testroom", "entityId": "user-bob", "band": 4, "relType": 21, "metadata": {"nodeType": "PERSON"}}' \
  "Create Second User Node"

# 9. Query graph nodes
test_endpoint "GET" "$BASE_URL/graph/query?chatKey=testroom&band=3" "" "Query Graph Nodes (Band 3)"

# 10. Get relationship properties
test_endpoint "GET" "$BASE_URL/taxonomy/rel-properties/26" "" "Relationship Properties (Type 26: Spouse)"

# 11. Test relationship composition
test_endpoint "POST" "$BASE_URL/taxonomy/compose" \
  '{"relType1": 1, "relType2": 21}' \
  "Relationship Composition (Parent ∘ Sibling)"

# 12. Get inverse relationship
test_endpoint "GET" "$BASE_URL/taxonomy/inverse/11" "" "Inverse Relationship (Type 11: Child → Parent)"

# 13. Check lattice compliance
test_endpoint "GET" "$BASE_URL/lattice/compliance/testroom" "" "Lattice Compliance Check"

# Cleanup
echo -e "${BLUE}Cleaning up...${NC}"
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo -e "${GREEN}✓ Tests complete!${NC}"
