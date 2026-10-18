// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
contract MockNFT is ERC721, ERC2981 {
    uint256 public constant MAX_SUPPLY = 4444;
    uint256 public publicMinted; uint256 public teamMinted;
    constructor(address r) ERC721("Z","Z") { _setDefaultRoyalty(r, 400); }
    function mint(address to, uint256 id) external { _mint(to, id); }
    function setCounts(uint256 p, uint256 t) external { publicMinted = p; teamMinted = t; }
    function supportsInterface(bytes4 i) public view override(ERC721, ERC2981) returns (bool) { return super.supportsInterface(i); }
}
contract MockCZ is ERC7984, ZamaEthereumConfig {
    constructor() ERC7984("cZ","cZ","") {}
    function mint(address to, uint64 a) external { euint64 x = FHE.asEuint64(a); _mint(to, x); }
}
contract MockQueen { mapping(address=>bool) public q; function set(address a, bool v) external { q[a]=v; } function isQueenHolder(address a) external view returns (bool) { return q[a]; } }
